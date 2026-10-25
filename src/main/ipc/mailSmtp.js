import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { getSecret } from '../secrets.js'
import { assetPath } from './templates.js'
import { buildOutgoingMime, appendToSent, friendlyMailError, accountFor } from './mailImap.js'
import { secretKeyFor, accountLabel, defaultSmtpHost } from '../../core/mailAccounts.js'

// Sending is the one irreversible thing this app does, so it deliberately reuses
// the draft path's MIME bytes verbatim (buildOutgoingMime): what goes out is the
// message you would have reviewed in Drafts, not a second rendering of it.

export { defaultSmtpHost }

export function smtpConfig(account) {
  const host = account?.smtpHost || defaultSmtpHost(account?.host)
  const port = Number(account?.smtpPort) || 587
  const where = `Settings → Mail settings${account?.label ? ` (${account.label})` : ''}`
  if (!host) throw new Error(`No SMTP server configured. Fill in ${where}.`)
  if (!account?.user) throw new Error(`No mail username configured. Fill in ${where}.`)
  const pass = getSecret(secretKeyFor(account.id))
  if (!pass) throw new Error(`No mail password stored for ${accountLabel(account)}. Add one in ${where}.`)
  return {
    host,
    port,
    // 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS. Getting
    // this pair wrong is what produces "Greeting never received".
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: account.user, pass },
    // Without these a bad host/port combination hangs the UI for minutes.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  }
}

// Split from the handler so tests can drive it with a fake transport.
export async function sendMailWith(transport, account, payload, { resolveAsset = assetPath, fileToSent = appendToSent } = {}) {
  const from = account.fromAddress || account.user
  if (!payload?.to) throw new Error('No recipient address.')

  const mime = await buildOutgoingMime(account, payload, resolveAsset)
  const info = await transport.sendMail({
    raw: mime,
    // The envelope has to be given explicitly with `raw`: nodemailer does not
    // parse the headers back out of a prebuilt message.
    envelope: { from, to: payload.to },
  })

  // Best-effort: a message that was accepted by the server is sent whether or
  // not it also shows up in Sent.
  let sentMailbox = null
  try {
    const filed = await fileToSent(mime, account.id)
    sentMailbox = filed?.mailbox || null
  } catch {
    /* the copy in Sent is a convenience, not part of sending */
  }

  return { accepted: info?.accepted || [payload.to], messageId: info?.messageId || null, sentMailbox }
}

export async function sendMailNow(payload) {
  const account = accountFor(payload?.accountId)
  const transport = nodemailer.createTransport(smtpConfig(account))
  try {
    return await sendMailWith(transport, account, payload)
  } catch (e) {
    throw new Error(friendlyMailError(e, account))
  } finally {
    transport.close()
  }
}

// Prove the sending side works without sending anything. SMTP was previously
// untestable — "Test connection" only ever checked IMAP — so the first sign of a
// wrong host or port was a failed send on a real venue.
export async function verifySmtp(accountId) {
  const account = accountFor(accountId)
  let config
  try {
    config = smtpConfig(account)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  const transport = nodemailer.createTransport(config)
  try {
    await transport.verify()
    return {
      ok: true,
      host: config.host,
      port: config.port,
      encryption: config.secure ? 'TLS' : 'STARTTLS',
      derived: !account.smtpHost,
    }
  } catch (e) {
    return { ok: false, error: friendlyMailError(e, account), host: config.host, port: config.port }
  } finally {
    transport.close()
  }
}

export function registerMailSmtpIpc() {
  // { to, subject, html, cids, accountId } → { accepted, messageId, sentMailbox }
  ipcMain.handle('mail:send', (_e, payload) => sendMailNow(payload))
  ipcMain.handle('mail:verifySmtp', (_e, accountId) => verifySmtp(accountId))
}
