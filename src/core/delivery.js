import { STATUS } from './constants.js'

// How a bulk run turns into actual mail: a draft in the Drafts mailbox, or a
// message that goes out over SMTP. Pure, so both the preflight list in the
// renderer and the scheduler in main agree on what a run will do.

export const DELIVERY_MODES = [
  {
    id: 'draft',
    label: 'Drafts only',
    hint: 'Everything lands in Drafts for you to review and send by hand.',
  },
  {
    id: 'auto',
    label: 'Auto column decides',
    hint: 'Venues flagged Auto are sent straight away; every other venue is drafted.',
  },
  {
    id: 'send',
    label: 'Send now',
    hint: 'Every selected venue is emailed immediately. There is no undo.',
  },
]

// Where a bulk run gets its venues from. Each is a filter over the rows already
// on screen, so what you see is what you draft.
export const SOURCES = [
  { id: 'nextBatch', label: 'Next batch', hint: 'The venues the batch rule picked, plus anything flagged Next Batch.' },
  { id: 'followUp', label: 'Follow-ups due', hint: 'Every venue whose follow-up date has passed.' },
  { id: 'draftFlag', label: 'Flagged Next Batch', hint: 'Only the venues you flagged Next Batch yourself.' },
  { id: 'filtered', label: 'Current view', hint: 'Exactly the rows your filters are showing right now.' },
  { id: 'selected', label: 'Selected venues', hint: 'The venues you picked in Select mode.' },
]

// `selected`: the _idx values picked in Select mode.
export function selectRows(source, { rows = [], filteredRows = [], selected = null }) {
  switch (source) {
    case 'nextBatch': return rows.filter(r => r._nextBatch || r['Draft'] === 'TRUE')
    case 'followUp': return rows.filter(r => r._status === STATUS.FOLLOW_UP_DUE)
    case 'draftFlag': return rows.filter(r => r['Draft'] === 'TRUE')
    case 'filtered': return filteredRows
    case 'selected': return selected ? rows.filter(r => selected.has(r._idx)) : []
    default: return []
  }
}

// A repeating run re-picks its venues every time it fires, so its source has to
// be something that can be worked out again — "whatever the filters showed when
// you set it up" cannot.
export function sourceRepeats(source) {
  return source !== 'filtered' && source !== 'selected'
}

export function isAutoSend(row) {
  return String(row?.['Auto'] ?? '').trim().toUpperCase() === 'TRUE'
}

// 'draft' | 'send' for one row under the chosen mode.
export function deliveryForRow(row, mode) {
  if (mode === 'send') return 'send'
  if (mode === 'auto') return isAutoSend(row) ? 'send' : 'draft'
  return 'draft'
}

// { draft, send } counts, for the button label and the warning line.
export function summarizeDelivery(rows, mode) {
  let draft = 0
  let send = 0
  for (const row of rows) {
    if (deliveryForRow(row, mode) === 'send') send += 1
    else draft += 1
  }
  return { draft, send }
}

// --- scheduling -------------------------------------------------------------
// A scheduled run only fires while the app is running. One that came due while
// the app was closed is run on the next launch rather than skipped, which is
// why "due" is `runAt <= now` and not a window around it.

export const REPEAT_OPTIONS = [
  { id: 'once', label: 'Once' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
]

export function repeatLabel(repeat) {
  return REPEAT_OPTIONS.find(r => r.id === repeat)?.label || 'Once'
}

// The next time a repeating run should fire, keeping the wall-clock time of the
// original: stepping the date (rather than adding 24h) is what makes "every day
// at 08:00" stay at 08:00 across a daylight-saving change.
export function nextOccurrence(fromIso, repeat, now = new Date()) {
  const step = repeat === 'daily' ? 1 : repeat === 'weekly' ? 7 : 0
  if (!step) return null
  const at = new Date(fromIso)
  if (Number.isNaN(at.getTime())) return null
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  // Always at least one step: the anchor is the run that just happened (or a
  // start time already in the past), never the answer. A run missed for months
  // then lands on the next future slot rather than firing once per missed slot.
  let guard = 0
  do {
    at.setDate(at.getDate() + step)
  } while (at.getTime() <= nowMs && guard++ < 5000)
  return at.toISOString()
}

export function isPending(job) {
  return job?.status === 'pending'
}

export function dueJobs(jobs, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return (jobs || []).filter(j => isPending(j) && new Date(j.runAt).getTime() <= t)
}

export function pendingJobs(jobs) {
  return (jobs || []).filter(isPending).sort((a, b) => new Date(a.runAt) - new Date(b.runAt))
}

// The value of a <input type="datetime-local"> is local wall-clock time with no
// zone; Date() parses it as local, which is what the user meant.
export function parseLocalDateTime(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// Rounded up to the next full 5 minutes, an hour out — a sane default for
// "later today" that is never already in the past.
export function defaultScheduleValue(now = new Date()) {
  const d = new Date(now.getTime() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
