import { ipcMain } from 'electron'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveSentMailbox, friendlyMailError } from './mailImap.js'
import { normalizeAccounts, accountLabel } from '../../core/mailAccounts.js'
import { latestByAddress, buildSyncEdits, buildMultiBandSyncEdits, scanSince } from '../../core/mailSync.js'
import { isMultiBand } from '../../core/multiBand.js'

// Reading the mail account to keep the CSV's date columns honest.
//
// Envelopes only — never message bodies. One pass over Sent gives "when did I last
// write to this venue", one pass over INBOX gives "when did they last answer".
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
  return people
    .filter(p => p?.address)
    .map(p => ({ address: p.address, date, subject }))
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
  return [{ address: from.address, date, autoReply, subject: msg.envelope.subject || '' }]
}

// One account's contribution to the sync.
async function scanAccount(account, { since, wantSent, wantReplies }) {
  return withImapClient(account, async (client, acc) => {
    let sent = []
    let inbox = []
    if (wantSent) {
      const mailboxes = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
      sent = await collect(client, resolveSentMailbox(mailboxes, acc.sentMailbox), since, sentRecipients)
    }
    if (wantReplies) {
      inbox = await collect(client, 'INBOX', since, inboxSenders)
    }
    return { sent, inbox }
  })
}

// rows: a slim projection — { _idx, Email, 'Last emailed', Status }.
//
// Every configured account is scanned and the results merged: a band's mail goes
// out from its own mailbox, and a venue's reply comes back to whichever address
// wrote to it, so looking at only one account would silently miss both. An
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

  for (const account of accounts) {
    // An account with no username was never set up; skip it silently rather than
    // reporting a failure the user did not cause.
    if (!account.user) continue
    try {
      const { sent, inbox } = await scanAccount(account, { since, wantSent, wantReplies })
      // Tagged so multi-band mode can match each band to its own mailbox.
      sentMessages.push(...sent.map(m => ({ ...m, accountId: account.id })))
      inboxMessages.push(...inbox.map(m => ({ ...m, accountId: account.id })))
    } catch (e) {
      failures.push(`${accountLabel(account)}: ${e.message}`)
    }
  }

  const opts = {
    lastEmailed: wantSent ? 'imap' : 'off',
    repliesMode: wantReplies ? 'imap' : 'off',
  }
  const edits = isMultiBand(settings)
    ? buildMultiBandSyncEdits(rows, { sent: sentMessages, replies: inboxMessages }, opts)
    : buildSyncEdits(rows, {
      sent: latestByAddress(sentMessages),
      replies: latestByAddress(inboxMessages),
    }, opts)

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
