import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveDraftsMailbox, accountFor, friendlyMailError, appendToSent } from './mailImap.js'
import { smtpConfig } from './mailSmtp.js'
import { normalizeAccounts } from '../../core/mailAccounts.js'

// The drafts waiting in each account's Drafts mailbox, for the Email window's
// "Current drafts" (components/DraftsPanel.jsx) and the ✓ on a venue's mail
// button. The renderer matches them to venues (core/draftMatch.js). A draft
// can be sent from here as it is, or deleted — for good, as the user chose:
// it does not go to Trash.

const LIMIT = 500
const person = p => ({ name: p?.name || '', address: p?.address || '' })

async function draftsMailbox(client, account) {
  const list = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
  const mailbox = resolveDraftsMailbox(list, account.draftsMailbox)
  return list.some(m => m.path === mailbox) ? mailbox : null
}

export async function listDraftsWith(client, account) {
  const mailbox = await draftsMailbox(client, account)
  if (!mailbox) return []
  const lock = await client.getMailboxLock(mailbox)
  try {
    let uids = await client.search({ deleted: false }, { uid: true })
    if (!uids?.length) return []
    uids = uids.slice(-LIMIT)
    const out = []
    for await (const msg of client.fetch(uids, { envelope: true, internalDate: true }, { uid: true })) {
      const env = msg.envelope || {}
      const date = env.date || msg.internalDate
      out.push({
        accountId: account.id,
        mailbox,
        uid: msg.uid,
        date: date ? new Date(date).toISOString() : '',
        to: (env.to || []).map(person),
        cc: (env.cc || []).map(person),
        subject: env.subject || '',
        messageId: env.messageId || '',
      })
    }
    return out
  } finally {
    lock.release()
  }
}

// Deleted for good: flagged \Deleted and expunged (UID EXPUNGE where the server
// has it, so nothing else flagged in the mailbox goes with it).
export async function deleteDraftWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const ok = await client.messageDelete(String(uid), { uid: true })
    if (!ok) throw new Error('That draft is no longer in the mailbox.')
    return { ok: true }
  } finally {
    lock.release()
  }
}

// A stored draft made ready to go out: the headers that only make sense in a
// draft (Mail's draft marker, autosave flags) are dropped and Date is now.
// `raw` is the message's bytes; → a Buffer, the body byte for byte as it was.
const DRAFT_ONLY = /^(x-uniform-type-identifier|x-apple-auto-saved|x-apple-mail-remote-attachments|x-apple-windows-friendly|x-apple-base-url|x-apple-mail-plain-text-draft|x-mozilla-draft-info|x-identity-key|date)\s*:/i
export function draftReadyToSend(raw, now = new Date()) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))
  const text = buf.toString('latin1')
  let end = text.indexOf('\r\n\r\n')
  let nl = '\r\n'
  if (end < 0) { end = text.indexOf('\n\n'); nl = '\n' }
  if (end < 0) return buf
  const kept = []
  let skipping = false
  for (const line of text.slice(0, end).split(nl)) {
    if (/^[ \t]/.test(line)) { if (!skipping) kept.push(line); continue } // a folded header line
    skipping = DRAFT_ONLY.test(line)
    if (!skipping) kept.push(line)
  }
  kept.push(`Date: ${now.toUTCString().replace('GMT', '+0000')}`)
  return Buffer.from(kept.join(nl) + text.slice(end), 'latin1')
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks)
}

// The draft's bytes and who it goes to (To and Cc; Bcc is not in an envelope).
export async function fetchDraftWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true })
    if (!msg) throw new Error('That draft is no longer in the mailbox.')
    const env = msg.envelope || {}
    const recipients = [...(env.to || []), ...(env.cc || []), ...(env.bcc || [])].map(p => p?.address).filter(Boolean)
    const { content } = await client.download(String(uid), undefined, { uid: true })
    return { raw: await streamToBuffer(content), recipients }
  } finally {
    lock.release()
  }
}

// Send one draft: over SMTP as it is, a copy into Sent, then out of Drafts.
// The steps after the send are best-effort — the mail has gone either way.
export async function sendDraftWith({ account, transport, fetchDraft, fileToSent, deleteDraft }) {
  const { raw, recipients } = await fetchDraft()
  if (!recipients.length) throw new Error('This draft has no recipient.')
  const mime = draftReadyToSend(raw)
  const info = await transport.sendMail({ raw: mime, envelope: { from: account.fromAddress || account.user, to: recipients } })
  let filed = true
  try { await fileToSent(mime) } catch { filed = false }
  let removed = true
  try { await deleteDraft() } catch { removed = false }
  return { accepted: info?.accepted || recipients, filed, removed }
}

export function registerMailDraftsIpc() {
  ipcMain.handle('mailDrafts:list', async () => {
    const accounts = normalizeAccounts(readSettings().mail).filter(a => a.host && a.user)
    // Each account is its own server login, so they are asked side by side.
    const results = await Promise.allSettled(accounts.map(account => withImapClient(account, listDraftsWith)))
    const drafts = []
    const failures = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') drafts.push(...r.value)
      else failures.push(friendlyMailError(r.reason, accounts[i]))
    })
    return { drafts, failures }
  })

  ipcMain.handle('mailDrafts:delete', async (_e, { accountId, mailbox, uid } = {}) => {
    try {
      return await withImapClient(accountFor(accountId), client => deleteDraftWith(client, mailbox, uid))
    } catch (e) {
      return { error: friendlyMailError(e) }
    }
  })

  ipcMain.handle('mailDrafts:send', async (_e, { accountId, mailbox, uid } = {}) => {
    const account = accountFor(accountId)
    let transport
    try {
      transport = nodemailer.createTransport(smtpConfig(account))
      return await sendDraftWith({
        account,
        transport,
        fetchDraft: () => withImapClient(account, client => fetchDraftWith(client, mailbox, uid)),
        fileToSent: mime => appendToSent(mime, account.id),
        deleteDraft: () => withImapClient(account, client => deleteDraftWith(client, mailbox, uid)),
      })
    } catch (e) {
      return { error: friendlyMailError(e, account) }
    } finally {
      transport?.close()
    }
  })
}
