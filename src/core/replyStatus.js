import { parseDate } from './parseDate.js'

// The consolidated `Status` column tracks the venue's response. It is one of:
//   ''                    → no response on record
//   'reply'               → venue replied, no date captured
//   'reply: <date>'       → venue replied on a date
//   'auto-reply: <date>'  → auto-responder fired on a date
// Parse it into a kind + optional date so display and row-coloring share one source.
export function parseReplyStatus(raw) {
  const s = (raw || '').trim()
  const kind = s.startsWith('auto-reply') ? 'auto-reply' : s.startsWith('reply') ? 'reply' : 'none'
  const dateStr = s.includes(':') ? s.slice(s.indexOf(':') + 1).trim() : ''
  return { kind, dateStr, date: parseDate(dateStr) }
}

// Rebuild a Status string from its parts (inverse of parseReplyStatus).
export function composeReplyStatus(kind, dateStr) {
  if (kind === 'none' || !kind) return ''
  return dateStr ? `${kind}: ${dateStr}` : kind
}

// Reply-health category that drives the row tint and the "Reply health" sort/filter.
// Driven by the venue's response, not by my last-email date.
//   gig        → confirmed upcoming gig (Last played in the future)   [green]
//   reply      → venue actually replied                              [neutral]
//   auto-reply → only an auto-responder fired                        [yellow]
//   silent     → emailed at least once, no response at all           [red]
//   none       → not yet contacted                                   [neutral]
// "Emailed" is a count above 0 or a Last emailed date: a date typed in by hand
// (the counters stayed 0) still means the venue has been written to.
export function replyHealth(row) {
  const played = parseDate(row['Last played'])
  if (played && played > new Date()) return 'gig'
  const { kind } = parseReplyStatus(row['Status'])
  if (kind === 'reply') return 'reply'
  if (kind === 'auto-reply') return 'auto-reply'
  if ((Number(row['Total emails']) || 0) > 0 || parseDate(row['Last emailed'])) return 'silent'
  return 'none'
}
