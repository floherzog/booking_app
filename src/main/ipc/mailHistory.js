import { ipcMain } from 'electron'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveSentMailbox, accountFor, friendlyMailError } from './mailImap.js'
import { AUTO_HEADERS, isAutoReply } from './mailSync.js'
import { normalizeAccounts } from '../../core/mailAccounts.js'
import { normalizeAddress } from '../../core/mailSync.js'

// A venue's emails, for its details (components/MailHistory.jsx): what came
// from its address into INBOX and what went to it from Sent, in every account
// that is set up — a band's mail goes out from its own mailbox, and an answer
// lands wherever it was sent. Envelopes for the list; one message's body when
// it is opened (MailReader), read-only and never marked as read (BODY.PEEK).

const LIMIT = 100

// "a@x.de; b@y.de" (a CSV Email cell) → ['a@x.de', 'b@y.de']
export function venueAddresses(value) {
  return [...new Set(String(value || '').split(/[;,\s]+/).map(normalizeAddress).filter(a => a.includes('@')))]
}

const person = p => ({ name: p?.name || '', address: p?.address || '' })
const anyOf = (field, addrs) => (addrs.length === 1 ? { [field]: addrs[0] } : { or: addrs.map(a => ({ [field]: a })) })

async function messagesIn(client, mailbox, query, direction, accountId) {
  let lock
  try { lock = await client.getMailboxLock(mailbox) } catch { return [] }
  try {
    let uids = await client.search(query, { uid: true })
    if (!uids?.length) return []
    uids = uids.slice(-LIMIT)
    const out = []
    for await (const msg of client.fetch(uids, { envelope: true, headers: AUTO_HEADERS }, { uid: true })) {
      const env = msg.envelope || {}
      out.push({
        accountId,
        mailbox,
        uid: msg.uid,
        date: env.date ? new Date(env.date).toISOString() : '',
        from: person((env.from || [])[0]),
        to: (env.to || []).map(person),
        subject: env.subject || '',
        messageId: env.messageId || '',
        direction,
        auto: direction === 'in' && isAutoReply({ headers: msg.headers ? msg.headers.toString() : '', subject: env.subject || '' }),
      })
    }
    return out
  } finally {
    lock.release()
  }
}

// One account: INBOX from the venue, Sent to it (To or Cc).
export async function listWith(client, account, addrs) {
  const mailboxes = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
  const sent = resolveSentMailbox(mailboxes, account.sentMailbox)
  const inbox = await messagesIn(client, 'INBOX', anyOf('from', addrs), 'in', account.id)
  const out = sent ? await messagesIn(client, sent, { or: [anyOf('to', addrs), anyOf('cc', addrs)] }, 'out', account.id) : []
  return [...inbox, ...out]
}

// Newest first, the same message (same Message-ID, e.g. in two accounts) once.
export function mergeHistory(lists) {
  const seen = new Set()
  return lists.flat()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .filter(m => {
      const key = m.messageId ? `${m.messageId}|${m.direction}` : `${m.accountId}|${m.mailbox}|${m.uid}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, LIMIT)
}

// The part to show: HTML if there is one, else plain text; never an attachment.
export function pickPart(node) {
  let html = null
  let text = null
  const walk = n => {
    if (!n) return
    if (n.childNodes?.length) { n.childNodes.forEach(walk); return }
    if (n.disposition === 'attachment') return
    const part = n.part || '1'
    if (n.type === 'text/html' && !html) html = { part, type: 'html' }
    if (n.type === 'text/plain' && !text) text = { part, type: 'text' }
  }
  walk(node)
  return html || text
}

async function streamToString(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks).toString('utf8')
}

export async function readWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true }, { uid: true })
    if (!msg) throw new Error('That message is no longer in the mailbox.')
    const env = msg.envelope || {}
    const head = {
      from: person((env.from || [])[0]),
      to: (env.to || []).map(person),
      cc: (env.cc || []).map(person),
      date: env.date ? new Date(env.date).toISOString() : '',
      subject: env.subject || '',
      messageId: env.messageId || '',
    }
    const part = pickPart(msg.bodyStructure)
    if (!part) return { ...head, text: '' }
    // download() decodes the transfer encoding and turns text into UTF-8.
    const { content } = await client.download(String(uid), part.part, { uid: true })
    const body = await streamToString(content)
    return { ...head, [part.type]: body }
  } finally {
    lock.release()
  }
}

export function registerMailHistoryIpc() {
  ipcMain.handle('mailHistory:list', async (_e, email) => {
    const addrs = venueAddresses(email)
    if (!addrs.length) return { messages: [] }
    const accounts = normalizeAccounts(readSettings().mail).filter(a => a.host && a.user)
    const lists = []
    const failures = []
    for (const account of accounts) {
      try { lists.push(await withImapClient(account, (client, acc) => listWith(client, acc, addrs))) } catch (e) { failures.push(friendlyMailError(e, account)) }
    }
    return { messages: mergeHistory(lists), failures }
  })
  ipcMain.handle('mailHistory:read', async (_e, { accountId, mailbox, uid } = {}) => {
    try {
      return await withImapClient(accountFor(accountId), client => readWith(client, mailbox, uid))
    } catch (e) {
      return { error: friendlyMailError(e) }
    }
  })
}
