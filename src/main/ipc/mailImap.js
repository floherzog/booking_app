import { ipcMain } from 'electron'
import { ImapFlow } from 'imapflow'
import { readSettings } from '../settingsStore.js'
import { getSecret } from '../secrets.js'
import { normalizeAccounts, accountById, secretKeyFor, accountLabel } from '../../core/mailAccounts.js'
import { assetPath } from './templates.js'
import { buildDraftMime } from '../mime.js'
import { htmlToText } from '../../core/htmlText.js'

// Drafts are created by APPENDing a message to the Drafts mailbox. That is the
// only way to get perfect formatting into Mail.app silently and in bulk — the
// AppleScript path (mailAppleScript.js) is a zero-config fallback for one draft.

const APPLE_ID_URL = 'https://appleid.apple.com'
const GOOGLE_APP_PASSWORDS_URL = 'https://myaccount.google.com/apppasswords'

// What to do about a rejected login depends on whose server it is: iCloud and
// Gmail both refuse the account's normal password outright and only take an
// app password, made in different places. The raw IMAP/SMTP response is not
// something to show a user.
function credentialsHint(account) {
  const host = `${account?.host || ''} ${account?.smtpHost || ''} ${account?.user || ''}`.toLowerCase()
  if (/gmail|googlemail|google\.com/.test(host)) {
    return `Google rejected that password. Gmail only accepts an app password here, not your Google password: turn on 2-Step Verification for the Google account, create an app password at ${GOOGLE_APP_PASSWORDS_URL}, and paste its 16 letters into the Password field in Settings → Mail.`
  }
  if (/icloud|me\.com|mac\.com/.test(host)) {
    return `The mail server rejected those credentials. iCloud needs an app-specific password (not your Apple ID password) — create one at ${APPLE_ID_URL} under Sign-In and Security, then paste it into Settings → Mail.`
  }
  return 'The mail server rejected that username and password. Check both in Settings → Mail. Many providers (iCloud, Gmail, Yahoo, GMX…) only accept an app password made in the account\'s security settings, not the normal password.'
}

// account, when known, picks the provider's own advice for a rejected login.
export function friendlyMailError(e, account) {
  const msg = String(e?.responseText || e?.message || e)
  // IMAP says AUTHENTICATIONFAILED; SMTP (nodemailer) says EAUTH / "Invalid login: 535 …".
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|Invalid login|EAUTH|Username and Password not accepted|\b535\b/i.test(msg) || e?.code === 'EAUTH') {
    return credentialsHint(account)
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'Could not find that mail server — check the host name in Settings → Mail.'
  if (/ECONNREFUSED/i.test(msg)) return 'The mail server refused the connection — check the host and port in Settings → Mail.'
  if (/ETIMEDOUT|timeout/i.test(msg)) return 'The mail server did not respond. Check your connection and the host/port in Settings → Mail.'
  // nodemailer/imapflow say this when the socket opens but no banner arrives.
  // The server is almost always waiting for a TLS handshake the client never
  // started — i.e. the port and its encryption do not match.
  if (/greeting never received|Greeting not received/i.test(msg)) {
    return 'Connected, but the mail server never said hello. That almost always means the port and its encryption do not match: try 587 (STARTTLS) or 465 (TLS) for sending, and 993 for IMAP. Use "Test sending" in Settings → Mail settings to check without sending a real email.'
  }
  if (/wrong version number|SSL routines|packet length too long/i.test(msg)) {
    return 'The mail server answered in plain text where encryption was expected (or the other way round). Try the other sending port — 587 for STARTTLS, 465 for TLS.'
  }
  if (/certificate/i.test(msg)) return `The mail server's TLS certificate could not be verified: ${msg}`
  return msg
}

// The mailbox to append into: what the user chose, else the one the server flags
// as SPECIAL-USE \Drafts, else the conventional name.
export function resolveDraftsMailbox(mailboxes, configured) {
  if (configured) return configured
  const special = (mailboxes || []).find(m => m.specialUse === '\\Drafts')
  if (special) return special.path
  const named = findByLeafName(mailboxes, DRAFTS_NAMES)
  return named ? named.path : 'Drafts'
}

// What servers without SPECIAL-USE call these folders. Many hosting providers
// (cPanel, Plesk, older Dovecot setups) nest everything under INBOX with "." or
// "/" as the separator, and German ones localise the name — so "INBOX.Sent" and
// "Gesendete Objekte" are as common as plain "Sent".
const DRAFTS_NAMES = ['drafts', 'draft', 'entwürfe', 'entwurf', 'brouillons']
const SENT_NAMES = [
  'sent', 'sent messages', 'sent items', 'sent mail',
  'gesendet', 'gesendete objekte', 'gesendete elemente', 'gesendete nachrichten',
  'envoyés', 'éléments envoyés',
]

function leafName(path) {
  return String(path || '').split(/[./]/).pop().trim().toLowerCase()
}

// Earlier names in the list win, so "Sent" beats "Sent Items" when both exist.
function findByLeafName(mailboxes, names) {
  const list = mailboxes || []
  for (const name of names) {
    const hit = list.find(m => leafName(m.path) === name)
    if (hit) return hit
  }
  return null
}

function mailboxSummary(list) {
  return (list || []).map(m => ({ path: m.path, specialUse: m.specialUse || '' }))
}

// --- the two operations, against any client that quacks like ImapFlow --------
// Split out so the tests can drive them with a recording double; the handlers
// below supply the real connection.

export async function testConnectionWith(client, account) {
  const mailboxes = mailboxSummary(await client.list())
  const sent = resolveSentMailbox(mailboxes, account?.sentMailbox)
  return {
    mailboxes,
    suggestion: resolveDraftsMailbox(mailboxes, account?.draftsMailbox),
    // Only a folder that really exists is worth preselecting.
    sentSuggestion: mailboxes.some(m => m.path === sent) ? sent : '',
  }
}

// The account a payload is addressed from. Every mail operation carries an
// accountId now; anything without one means the default account, which is what
// a single-mailbox setup has always used.
export function accountFor(accountId, settings = readSettings()) {
  return accountById(normalizeAccounts(settings.mail), accountId)
}

// The RFC822 bytes for one venue's mail. Shared by the draft path and the SMTP
// send path, so a sent message is byte-for-byte the message the draft would
// have been.
export async function buildOutgoingMime(account, { to, subject, html, cids = [] }, resolveAsset = assetPath) {

  // cids arrive as [{ cid, assetId }] from renderEmailHtml; main is the only
  // side that knows where the asset files actually live.
  const inlineAssets = []
  for (const { cid, assetId } of cids) {
    const path = resolveAsset(assetId)
    if (path) inlineAssets.push({ path, cid })
  }

  return buildDraftMime({
    from: { name: account.fromName, address: account.fromAddress || account.user },
    to,
    subject,
    html,
    text: htmlToText(html),
    inlineAssets,
  })
}

export async function appendDraftWith(client, account, payload, resolveAsset = assetPath) {
  const mime = await buildOutgoingMime(account, payload, resolveAsset)

  const mailbox = resolveDraftsMailbox(mailboxSummary(await client.list()), account.draftsMailbox)

  // \Draft is essential: without it Mail.app files the message as received mail
  // rather than an editable draft. \Seen stops it counting as unread.
  const res = await client.append(mailbox, mime, ['\\Draft', '\\Seen'])
  return { mailbox, uid: res?.uid ?? null }
}

// A connection per call takes 1–2s. Pooling is a later optimization; correctness
// and never leaving a socket open matter more here.
export async function withImapClient(accountOrFn, maybeFn) {
  // withImapClient(fn) still means the default account, which is every call from
  // a single-mailbox setup.
  const fn = typeof accountOrFn === 'function' ? accountOrFn : maybeFn
  const account = typeof accountOrFn === 'function' ? accountFor(null) : accountOrFn

  const where = `Settings → Mail settings${account?.label ? ` (${account.label})` : ''}`
  if (!account?.host) throw new Error(`No IMAP server configured. Fill in ${where}.`)
  if (!account?.user) throw new Error(`No IMAP username configured. Fill in ${where}.`)

  const pass = getSecret(secretKeyFor(account.id))
  if (!pass) throw new Error(`No mail password stored for ${accountLabel(account)}. Add one in ${where}.`)

  const client = new ImapFlow({
    host: account.host,
    port: Number(account.port) || 993,
    secure: true,
    auth: { user: account.user, pass },
    logger: false,
    // Fail fast rather than hanging the UI on a wrong host.
    socketTimeout: 30000,
  })

  try {
    await client.connect()
    return await fn(client, account)
  } catch (e) {
    throw new Error(friendlyMailError(e, account))
  } finally {
    try { await client.logout() } catch { /* already gone */ }
  }
}

// The operation itself, callable from the scheduler as well as over IPC.
export function appendDraftNow(payload) {
  return withImapClient(accountFor(payload?.accountId), (client, account) =>
    appendDraftWith(client, account, payload))
}

// Filing a sent message in Sent is a courtesy, never a reason to report the
// send as failed — SMTP has already accepted it by the time this runs.
export function resolveSentMailbox(mailboxes, configured) {
  if (configured) return configured
  const special = (mailboxes || []).find(m => m.specialUse === '\\Sent')
  if (special) return special.path
  const named = findByLeafName(mailboxes, SENT_NAMES)
  return named ? named.path : 'Sent Messages'
}

export async function appendToSent(mime, accountId) {
  return withImapClient(accountFor(accountId), async (client, account) => {
    const mailboxes = mailboxSummary(await client.list())
    const mailbox = resolveSentMailbox(mailboxes, account.sentMailbox)
    // Never file into a folder the server does not have. Some servers create it
    // on APPEND, which left the copy in a stray "Sent Messages" folder next to
    // the real one. Without a match the copy is skipped — the mail is sent
    // either way, and the Sent mailbox can be named in Settings.
    if (!mailboxes.some(m => m.path === mailbox)) return { mailbox: null, uid: null }
    const res = await client.append(mailbox, mime, ['\\Seen'])
    return { mailbox, uid: res?.uid ?? null }
  })
}

export function registerMailImapIpc() {
  // → { mailboxes: [{ path, specialUse }], suggestion }
  ipcMain.handle('mail:testConnection', (_e, accountId) =>
    withImapClient(accountFor(accountId), testConnectionWith))

  // { to, subject, html, cids } → { mailbox, uid }
  ipcMain.handle('mail:appendDraft', (_e, payload) =>
    appendDraftNow(payload),
  )
}
