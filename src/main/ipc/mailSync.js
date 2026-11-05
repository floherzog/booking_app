import { ipcMain } from 'electron'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveSentMailbox, friendlyMailError } from './mailImap.js'
import { normalizeAccounts, accountLabel } from '../../core/mailAccounts.js'
import { buildMultiBandSyncEdits, scanSince, normalizeAddress } from '../../core/mailSync.js'
import { bandsNamed, textOfSource } from '../../core/bandNames.js'

// Reading the mail account to keep the CSV's date columns honest.
//
// Envelopes, mostly. One pass over Sent gives "when did I last write to this
// venue", one pass over INBOX gives "when did they last answer". Only where
// bands sharing a mailbox book the same venue, and the subject doesn't say
// which band an email is about, is the start of that email read as well.
// Nothing is written to the CSV here: the renderer stages the result as ordinary
// edits, and the Save button remains the only thing that touches the file.

// Headers that mark a machine-generated reply. RFC 3834 defines Auto-Submitted;
// the rest are what mail servers actually send.
export const AUTO_HEADERS = ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence', 'x-auto-response-suppress']

const AUTO_SUBJECT = /^\s*(re:\s*)?(auto(matic)?[-\s]?(reply|response)|out of office|abwesenheit|automatische\s+antwort|autoreply)/i

export function isAutoReply({ headers = '', subject = '' } = {}) {
  const h = String(headers || '').toLowerCase()
  // "Auto-Submitted: no" is the explicit marker for a human-written message.
  const submitted = h.match(/^auto-submitted:\s*(.+)$/m)
  if (submitted && submitted[1].trim().split(';')[0].trim() !== 'no') return true
  if (/^x-auto(reply|respond):/m.test(h)) return true
  if (/^precedence:\s*(auto_reply|bulk|junk)/m.test(h)) return true
  return AUTO_SUBJECT.test(String(subject || ''))
}

// Guard against a decade-old mailbox: envelopes are small, but a quarter of a
// million of them is still a long wait for no benefit.
const MAX_MESSAGES = 20000

async function collect(client, mailbox, since, extract) {
  let lock
  try {
    lock = await client.getMailboxLock(mailbox)
  } catch {
    return [] // mailbox gone or not selectable — not worth failing the whole sync
  }
  try {
    let uids = await client.search({ since }, { uid: true })
    if (!uids || !uids.length) return []
    if (uids.length > MAX_MESSAGES) uids = uids.slice(-MAX_MESSAGES) // newest wins
    const out = []
    for await (const msg of client.fetch(uids, { envelope: true, headers: AUTO_HEADERS }, { uid: true })) {
      const found = extract(msg)
      if (found) out.push(...found)
    }
    return out
  } finally {
    lock.release()
  }
}

function envelopeDate(msg) {
  return msg?.envelope?.date ? new Date(msg.envelope.date) : null
}

// Everyone a sent message went to — To and Cc, since a venue is sometimes cc'd.
function sentRecipients(msg) {
  const date = envelopeDate(msg)
  if (!date || Number.isNaN(date.getTime())) return null
  const people = [...(msg.envelope.to || []), ...(msg.envelope.cc || [])]
  // The subject tells bands apart that share a mailbox (multi-band mode).
  const subject = msg.envelope.subject || ''
  const messageId = msg.envelope.messageId || ''
  return people
    .filter(p => p?.address)
    .map(p => ({ address: p.address, date, subject, messageId, uid: msg.uid }))
}

function inboxSenders(msg) {
  const date = envelopeDate(msg)
  if (!date || Number.isNaN(date.getTime())) return null
  const from = (msg.envelope.from || [])[0]
  if (!from?.address) return null
  const autoReply = isAutoReply({
    headers: msg.headers ? msg.headers.toString() : '',
    subject: msg.envelope.subject || '',
  })
  return [{ address: from.address, date, autoReply, subject: msg.envelope.subject || '', inReplyTo: msg.envelope.inReplyTo || '', uid: msg.uid }]
}

const TEXT_BYTES = 24 * 1024
const MAX_TEXTS = 300

// The start of each message that has to say which band it is about, as text,
// on `text`. `rivals`: address → the bands sharing this account at that venue.
export async function readTextsWith(client, mailbox, messages, rivals) {
  const want = messages.filter(m => {
    const bands = rivals.get(normalizeAddress(m.address))
    return bands && !bandsNamed(m.subject, bands).length
  })
  const uids = [...new Set(want.map(m => m.uid))].filter(Boolean).slice(-MAX_TEXTS)
  if (!uids.length) return
  let lock
  try { lock = await client.getMailboxLock(mailbox) } catch { return }
  try {
    const texts = new Map()
    for await (const msg of client.fetch(uids, { source: { start: 0, maxLength: TEXT_BYTES } }, { uid: true })) {
      if (msg.source) texts.set(msg.uid, textOfSource(msg.source))
    }
    for (const m of want) if (texts.has(m.uid)) m.text = texts.get(m.uid)
  } catch { /* the subject alone decides, as before */ } finally {
    lock.release()
  }
}

// One account's contribution to the sync.
async function scanAccount(account, { since, wantSent, wantReplies, rivals, replyRivals }) {
  return withImapClient(account, async (client, acc) => {
    let sent = []
    let inbox = []
    if (wantSent) {
      const mailboxes = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
      const box = resolveSentMailbox(mailboxes, acc.sentMailbox)
      sent = await collect(client, box, since, sentRecipients)
      if (rivals?.size) await readTextsWith(client, box, sent, rivals)
    }
    if (wantReplies) {
      inbox = await collect(client, 'INBOX', since, inboxSenders)
      if (replyRivals?.size) await readTextsWith(client, 'INBOX', inbox, replyRivals)
    }
    return { sent, inbox }
  })
}

// accountId → (address → bands): the venues where several bands read the same
// account, so a message to them must name its band. `reply`: the inbox, where a
// band also reads its receive-only accounts; else Sent, its own account only.
export function rivalsByAccount(rows = [], { reply = false } = {}) {
  const groups = new Map()
  for (const r of rows) {
    const band = String(r.Band || '').trim()
    const address = normalizeAddress(r.Email)
    if (!band || !address || r._venueId == null) continue
    const accounts = reply ? [r.accountId || '', ...(r.replyAccountIds || [])] : [r.accountId || '']
    for (const accountId of new Set(accounts)) {
      const key = `${accountId}|${r._venueId}`
      const g = groups.get(key) || { accountId, address, bands: [] }
      g.bands.push(band)
      groups.set(key, g)
    }
  }
  const out = new Map()
  for (const g of groups.values()) {
    if (g.bands.length < 2) continue
    const byAddress = out.get(g.accountId) || new Map()
    byAddress.set(g.address, [...new Set([...(byAddress.get(g.address) || []), ...g.bands])])
    out.set(g.accountId, byAddress)
  }
  return out
}

// rows: a slim projection — { _idx, _venueId, Email, Band, accountId, replyAccountIds, 'Last emailed', Status }.
//
// Every configured account is scanned and the results merged; each line then
// counts only its band's own accounts (core/mailSync.js). An
// account that cannot be reached is reported but never sinks the whole sync —
// the ones that did work still produce their edits.
export async function runMailSync(rows = []) {
  const settings = readSettings()
  const sync = settings.mail?.sync || {}
  const wantSent = sync.lastEmailed === 'imap'
  const wantReplies = sync.replies === 'imap'
  if (!wantSent && !wantReplies) return { edits: [], scanned: { sent: 0, inbox: 0 }, skipped: 'off' }

  const since = scanSince(sync.months)
  const accounts = normalizeAccounts(settings.mail)

  const sentMessages = []
  const inboxMessages = []
  const failures = []

  // An account with no username was never set up; skip it silently rather than
  // reporting a failure the user did not cause. The others are scanned side by
  // side: each is its own server login.
  const live = accounts.filter(a => a.user)
  const rivals = rivalsByAccount(rows)
  const replyRivals = rivalsByAccount(rows, { reply: true })
  const results = await Promise.allSettled(live.map(account => scanAccount(account, { since, wantSent, wantReplies, rivals: rivals.get(account.id), replyRivals: replyRivals.get(account.id) })))
  results.forEach((r, i) => {
    const account = live[i]
    if (r.status === 'rejected') { failures.push(`${accountLabel(account)}: ${r.reason?.message || r.reason}`); return }
    // Tagged so multi-band mode can match each band to its own mailbox.
    sentMessages.push(...r.value.sent.map(({ uid, ...m }) => ({ ...m, accountId: account.id })))
    inboxMessages.push(...r.value.inbox.map(({ uid, ...m }) => ({ ...m, accountId: account.id })))
  })

  const opts = {
    lastEmailed: wantSent ? 'imap' : 'off',
    repliesMode: wantReplies ? 'imap' : 'off',
  }
  // A venue's lines are linked by _venueId; one booked for several bands has
  // its messages told apart by account, subject and text (core/mailSync.js).
  const edits = buildMultiBandSyncEdits(rows, { sent: sentMessages, replies: inboxMessages }, opts)

  return {
    edits,
    scanned: { sent: sentMessages.length, inbox: inboxMessages.length, accounts: accounts.length },
    failures,
    since: since.toISOString(),
  }
}

export function registerMailSyncIpc() {
  ipcMain.handle('mail:sync', async (_e, rows) => {
    try {
      return await runMailSync(rows)
    } catch (e) {
      return { error: friendlyMailError(e), edits: [] }
    }
  })
}
