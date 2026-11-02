import { parseDate } from './parseDate.js'
import { parseReplyStatus } from './replyStatus.js'

// "Total emails" and "Recent emails" (since the last reply) follow the dates
// they count. A later Last emailed than the CSV has — typed in, stamped by a
// send, or found by mail sync — is one more email; a new real reply starts
// Recent emails again. They are staged next to the date edit, so they appear
// in the save dialog and are confirmed with it.
//
// `original` is the row as the CSV has it, `rowEdits` its staged edits after
// the change. → the edits with the counters set (or taken back again).
// Counters edited by hand are left alone: the counters are only touched when
// they are unedited or still hold the value this would have staged.

const COUNTERS = ['Total emails', 'Recent emails']
const num = v => Number(v) || 0
const later = (a, b) => !!a && (!b || a > b)

// What the counters should be for these edits, or null for "as in the CSV".
export function stagedCounters(original, rowEdits) {
  const before = { ...original }
  const after = { ...original, ...rowEdits }
  const total = num(before['Total emails'])
  const recent = num(before['Recent emails'])
  const newSend = later(parseDate(after['Last emailed']), parseDate(before['Last emailed']))
  const replyBefore = parseReplyStatus(before['Status'])
  const replyAfter = parseReplyStatus(after['Status'])
  const newReply = replyAfter.kind === 'reply' && replyAfter.date
    && (replyBefore.kind !== 'reply' || later(replyAfter.date, replyBefore.date))
  if (!newSend && !newReply) return null
  const out = { 'Total emails': String(newSend ? total + 1 : total) }
  if (newReply) {
    // Answered: only a send after the answer counts as recent.
    const sentAfter = newSend && later(parseDate(after['Last emailed']), replyAfter.date)
    out['Recent emails'] = sentAfter ? '1' : '0'
  } else {
    out['Recent emails'] = String(recent + 1)
  }
  return out
}

export function withEmailCounters(original, rowEdits, previousEdits = {}) {
  if (!original) return rowEdits
  const prevAuto = stagedCounters(original, previousEdits) || {}
  const want = stagedCounters(original, rowEdits)
  const next = { ...rowEdits }
  for (const key of COUNTERS) {
    const csv = original[key] ?? ''
    const staged = previousEdits[key]
    // A counter the user changed by hand stays as they left it.
    const handEdited = staged !== undefined && staged !== prevAuto[key]
    if (handEdited) continue
    const value = want ? want[key] : undefined
    if (value === undefined || value === String(csv) || (value === '0' && csv === '')) delete next[key]
    else next[key] = value
  }
  return next
}
