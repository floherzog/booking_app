import { ACTION_STATUSES, STATUS } from './constants.js'
import { DEFAULT_RULES } from './rules.js'
import { EMPTY_FILTERS, matchesFilters, describeFilters } from './filterRows.js'
import { parseDate, formatDateDDMMYY } from './parseDate.js'
import { plainT } from './tr.js'

// The next batch is simply the first N rows whose classified status is
// actionable (see classifyBooking / ACTION_STATUSES). Deriving it from the
// already-computed _status keeps it a strict subset of the status badges, so it
// can never disagree with them (e.g. a "Festival (not now)" or "Recent contact"
// row can no longer leak into the batch). Size and sort order come from the rules.
export function computeNextBatch(rows, today, rules = DEFAULT_RULES) {
  const sortKeys = rules.batchSortKeys?.length ? rules.batchSortKeys : DEFAULT_RULES.batchSortKeys
  const candidates = rows
    .filter(r => ACTION_STATUSES.has(r._status))
    .sort((a, b) => {
      for (const key of sortKeys) {
        const c = (a[key] || '').localeCompare(b[key] || '')
        if (c !== 0) return c
      }
      return 0
    })
  return new Set(candidates.slice(0, rules.batchSize).map(r => r._idx))
}

// Why the Next batch chip shows nothing, as one sentence and the one thing to
// do about it. The first case that applies wins:
//   batch size 0                      → { action: 'rules' }
//   the batch exists, other filters hide it → { action: 'onlyBatch' }
//   nothing needs action: how many are waiting and when the next follow-up is
//   due, and how many would qualify but are missing info → { action: 'missingInfo' | null }
// `rows` are the live rows (with _status and _nextBatch); `filters` what the
// list is filtered by; `ctx` the matchesFilters context; `columnLabel` names
// columns in the description of the other filters; `t` translates (tr.js).
export function explainEmptyBatch({ rows, filters, rules = DEFAULT_RULES, today = new Date(), ctx = {}, columnLabel, t = plainT }) {
  if (!Number(rules.batchSize)) {
    return { reason: t('The next batch size is 0, so it never picks any venues.'), action: 'rules' }
  }
  const inBatch = rows.filter(r => r._nextBatch || r['Draft'] === 'TRUE')
  if (inBatch.length) {
    const others = { ...EMPTY_FILTERS, ...filters, nextBatch: false }
    if (!inBatch.some(r => matchesFilters(r, { ...others, nextBatch: true }, ctx))) {
      return {
        reason: t('The next batch has {n} venue, but your other filters ({filters}) hide it.|The next batch has {n} venues, but your other filters ({filters}) hide them.', { n: inBatch.length, filters: describeFilters(others, columnLabel, t) }),
        action: 'onlyBatch',
      }
    }
    return null
  }
  const waiting = rows.filter(r => r._status === STATUS.FOLLOW_UP_PENDING || r._status === STATUS.RECENT_CONTACT).length
  const missing = rows.filter(r => r._status === STATUS.MISSING_INFO).length
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = null
  for (const r of rows) {
    if (r._status === STATUS.DEAD || r._status === STATUS.MISSING_INFO) continue
    const d = parseDate(r['Follow Up Date'])
    if (d && d >= start && (!next || d < next.date)) next = { date: d, venue: r['Venue'] }
  }
  let reason = t('No venue needs contacting right now')
  const parts = []
  if (waiting) parts.push(t('{n} venue is waiting for a reply or their next turn|{n} venues are waiting for a reply or their next turn', { n: waiting }))
  if (next) {
    const date = formatDateDDMMYY(next.date)
    parts.push(next.venue ? t('the next follow-up is due on {date} ({venue})', { date, venue: next.venue }) : t('the next follow-up is due on {date}', { date }))
  }
  reason += parts.length ? ` — ${parts.join(`, ${t('and')} `)}.` : '.'
  if (missing) {
    reason += ` ${t('{n} more venue would qualify but is missing info.|{n} more venues would qualify but are missing info.', { n: missing })}`
    return { reason, action: 'missingInfo' }
  }
  return { reason, action: null }
}
