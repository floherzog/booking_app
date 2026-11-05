// Turning what the mail account knows into edits for the CSV.
//
// Deliberately pure and separate from the IMAP client: the fiddly part is not
// fetching messages, it is deciding which rows to touch and never clobbering
// something the user typed. Nothing here writes — it returns staged edits that go
// through the same Save button as a hand edit.
import { parseDate, formatDateDDMMYY } from './parseDate.js'
import { parseReplyStatus, composeReplyStatus } from './replyStatus.js'
import { bandsNamed } from './bandNames.js'

// "Anna Müller <A.Mueller@Venue.DE>" → "a.mueller@venue.de". Addresses are the
// only join between a mailbox and a CSV row, so they have to compare stably.
export function normalizeAddress(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const angled = raw.match(/<([^>]+)>/)
  return (angled ? angled[1] : raw).trim().toLowerCase()
}

// Latest message per address. `messages` are { address, date, autoReply } in any
// order; only the newest per address survives.
export function latestByAddress(messages = []) {
  const out = new Map()
  for (const m of messages) {
    const address = normalizeAddress(m?.address)
    if (!address) continue
    const date = m?.date instanceof Date ? m.date : new Date(m?.date)
    if (Number.isNaN(date.getTime())) continue
    const prev = out.get(address)
    if (!prev || date > prev.date) out.set(address, { date, autoReply: !!m?.autoReply })
  }
  return out
}

// Only move a date forward. A venue emailed by hand and recorded in the CSV must
// not be rewound because the mailbox copy was deleted or the window was too short.
function isNewer(candidate, existingRaw) {
  const existing = parseDate(existingRaw)
  if (!existing) return true
  // Compare by day: the CSV only stores DD.MM.YY, so a same-day message is not news.
  const a = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
  const b = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate())
  return a > b
}

// The edits one row gets from its latest sent message and latest reply (either
// may be missing).
function editsForRow(row, sentHit, replyHit, { lastEmailed, repliesMode }) {
  const edits = []
  if (lastEmailed === 'imap' && sentHit && isNewer(sentHit.date, row['Last emailed'])) {
    edits.push({ _idx: row._idx, field: 'Last emailed', value: formatDateDDMMYY(sentHit.date), before: row['Last emailed'] || '' })
  }
  if (repliesMode === 'imap' && replyHit) {
    const current = parseReplyStatus(row['Status'])
    // A real reply always outranks an auto-reply already on record, even when
    // the auto-reply is newer — an auto-responder is not a response.
    const upgrade = current.kind !== 'reply' && !replyHit.autoReply
    if (upgrade || isNewer(replyHit.date, current.dateStr)) {
      const value = composeReplyStatus(replyHit.autoReply ? 'auto-reply' : 'reply', formatDateDDMMYY(replyHit.date))
      if (value !== (row['Status'] || '')) {
        edits.push({ _idx: row._idx, field: 'Status', value, before: row['Status'] || '' })
      }
    }
  }
  return edits
}

// → [{ _idx, field, value, before }]. One entry per cell that would change.
//
// `sent` and `replies` are the maps from latestByAddress(). A row whose Email is
// blank, or which no message matches, is left alone entirely.
export function buildSyncEdits(rows = [], { sent = new Map(), replies = new Map() } = {}, opts = {}) {
  const { lastEmailed = 'imap', repliesMode = 'imap' } = opts
  const edits = []
  for (const row of rows) {
    const address = normalizeAddress(row?.['Email'])
    if (!address) continue
    edits.push(...editsForRow(row, sent.get(address), replies.get(address), { lastEmailed, repliesMode }))
  }
  return edits
}

// Which messages count for which line. Every line counts only its band's own
// mailboxes: Last emailed what was sent from the band's account, a reply what
// arrived there or in the band's receive-only accounts (Settings ▸ Bands). A
// band with its own mailbox no longer picks up mail the main account had with
// the same venue. A line whose account isn't known (no accounts set up) counts
// every account, as before.
//
// A venue booked for several bands on the same account:
//   - the message has to say which band it is about: the bands named in the
//     subject, else in its text (`text`, read for just these messages — see
//     main/ipc/mailSync.js). An email naming two bands pitched both, and
//     counts for both;
//   - a reply naming no band answers the email it replies to (In-Reply-To),
//     else the latest one sent to that address before it;
//   - a message that still names no band counts for none of them: the CSV
//     keeps what it has rather than give one band another band's dates.
//
// `rows` carry { _idx, Email, Band, accountId, replyAccountIds?, _venueId,
// 'Last emailed', Status }; `sent` and `replies` are raw message lists:
// { address, date, autoReply, subject, accountId, messageId?, inReplyTo?, text? }.
export function buildMultiBandSyncEdits(rows = [], { sent = [], replies = [] } = {}, opts = {}) {
  const { lastEmailed = 'imap', repliesMode = 'imap' } = opts

  const byAddress = list => {
    const out = new Map()
    for (const m of list) {
      const key = normalizeAddress(m?.address)
      const bucket = out.get(key)
      if (bucket) bucket.push(m)
      else out.set(key, [m])
    }
    return out
  }
  const sentAny = byAddress(sent)
  const repliesAny = byAddress(replies)

  // The accounts a line reads, per kind of message; null = all of them.
  const accountsOf = (row, reply) => {
    if (!row.accountId) return null
    return new Set(reply ? [row.accountId, ...(row.replyAccountIds || [])] : [row.accountId])
  }
  const venueLines = new Map()
  for (const r of rows) {
    if (r._venueId == null) continue
    const list = venueLines.get(r._venueId)
    if (list) list.push(r)
    else venueLines.set(r._venueId, [r])
  }
  // The venue's bands that read this message's account — the ones it has to
  // tell apart.
  const rivalsFor = (row, m, reply) => {
    const lines = row._venueId == null ? [row] : venueLines.get(row._venueId) || [row]
    const bands = lines
      .filter(r => { const a = accountsOf(r, reply); return !a || a.has(m.accountId || '') })
      .map(r => String(r['Band'] || '').trim())
      .filter(Boolean)
    return [...new Set(bands)]
  }

  // The bands a message names, among those it has to tell apart.
  const named = (m, bands) => {
    const inSubject = bandsNamed(m.subject, bands)
    return inSubject.length ? inSubject : bandsNamed(m.text, bands)
  }
  const sentById = new Map(sent.filter(m => m?.messageId).map(m => [m.messageId, m]))
  // A reply that names no band: the bands of the email it answers (sent from
  // whichever account — a reply may arrive in a receive-only one).
  const answered = (m, bands) => {
    const parent = m.inReplyTo && sentById.get(m.inReplyTo)
    if (parent) {
      const b = named(parent, bands)
      if (b.length) return b
    }
    const earlier = (sentAny.get(normalizeAddress(m.address)) || [])
      .filter(s => new Date(s.date) <= new Date(m.date))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    for (const s of earlier) {
      const b = named(s, bands)
      if (b.length) return b
    }
    return []
  }

  const forRow = (messages, row, { reply = false } = {}) => {
    if (!messages?.length) return null
    const accounts = accountsOf(row, reply)
    const own = String(row['Band'] || '').trim().toLowerCase()
    const mine = messages.filter(m => {
      if (accounts && !accounts.has(m.accountId || '')) return false
      const bands = rivalsFor(row, m, reply)
      if (bands.length < 2) return true
      let hit = named(m, bands)
      if (!hit.length && reply) hit = answered(m, bands)
      return hit.some(b => b.toLowerCase() === own)
    })
    return latestByAddress(mine).get(normalizeAddress(row['Email'])) || null
  }

  const edits = []
  for (const row of rows) {
    const address = normalizeAddress(row?.['Email'])
    if (!address) continue
    edits.push(...editsForRow(row, forRow(sentAny.get(address), row), forRow(repliesAny.get(address), row, { reply: true }), { lastEmailed, repliesMode }))
  }
  return edits
}

// Oldest message worth fetching, as a Date. Scanning all of Sent on a long-lived
// account is slow and pointless — outreach older than this is already recorded.
export function scanSince(months = 24, now = new Date()) {
  const n = Number(months)
  const span = Number.isFinite(n) && n > 0 ? Math.min(n, 240) : 24
  const since = new Date(now)
  since.setMonth(since.getMonth() - span)
  return since
}
