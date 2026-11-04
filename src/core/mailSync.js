// Turning what the mail account knows into edits for the CSV.
//
// Deliberately pure and separate from the IMAP client: the fiddly part is not
// fetching messages, it is deciding which rows to touch and never clobbering
// something the user typed. Nothing here writes — it returns staged edits that go
// through the same Save button as a hand edit.
import { parseDate, formatDateDDMMYY } from './parseDate.js'
import { parseReplyStatus, composeReplyStatus } from './replyStatus.js'

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

// A venue booked for several bands: one venue, several bands, possibly several
// mailboxes. An address alone no longer says which band a message belongs to, so:
//   - a venue with one line counts every account's messages, as always;
//   - otherwise an entry only counts messages from its own band's account (`accountId`);
//   - when more of the venue's bands use that same account, the subject decides
//     — a message naming exactly one of those bands belongs to that band;
//   - a message naming none (or several) counts for all of them, because
//     guessing wrong would hide a venue that did get mail.
//
// `rows` carry { _idx, Email, Band, accountId, _venueId, 'Last emailed', Status };
// `sent` and `replies` are raw message lists: { address, date, autoReply, subject, accountId }.
export function buildMultiBandSyncEdits(rows = [], { sent = [], replies = [] } = {}, opts = {}) {
  const { lastEmailed = 'imap', repliesMode = 'imap' } = opts

  const index = list => {
    const out = new Map()
    for (const m of list) {
      const key = `${m?.accountId || ''}|${normalizeAddress(m?.address)}`
      const bucket = out.get(key)
      if (bucket) bucket.push(m)
      else out.set(key, [m])
    }
    return out
  }
  const sentBy = index(sent)
  const repliesBy = index(replies)
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
  const lines = new Map()
  for (const r of rows) lines.set(r._venueId, (lines.get(r._venueId) || 0) + 1)

  // The bands each venue has on each account — the ones a subject must tell apart.
  const rivals = new Map()
  for (const r of rows) {
    const key = `${r._venueId}|${r.accountId || ''}`
    const band = String(r['Band'] || '').trim()
    if (!band) continue
    const list = rivals.get(key)
    if (list) list.push(band)
    else rivals.set(key, [band])
  }

  const forRow = (messages, row) => {
    if (!messages?.length) return null
    const bands = rivals.get(`${row._venueId}|${row.accountId || ''}`) || []
    const own = String(row['Band'] || '').trim().toLowerCase()
    const mine = bands.length < 2 ? messages : messages.filter(m => {
      const subject = String(m.subject || '').toLowerCase()
      const named = bands.filter(b => subject.includes(b.toLowerCase()))
      return named.length !== 1 || named[0].toLowerCase() === own
    })
    return latestByAddress(mine).get(normalizeAddress(row['Email'])) || null
  }

  const edits = []
  for (const row of rows) {
    const address = normalizeAddress(row?.['Email'])
    if (!address) continue
    const single = row._venueId == null || (lines.get(row._venueId) || 0) < 2
    const key = `${row.accountId || ''}|${address}`
    const s = single ? sentAny.get(address) : sentBy.get(key)
    const r = single ? repliesAny.get(address) : repliesBy.get(key)
    edits.push(...editsForRow(row, forRow(s, row), forRow(r, row), { lastEmailed, repliesMode }))
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
