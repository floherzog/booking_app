import { plainT } from './tr.js'
// Every venue-selection number the app used to hardcode, in one editable object.
// DEFAULT_RULES reproduces the webapp's behaviour exactly, so a fresh install
// classifies identically; the Rules editor writes a full rules object into the
// settings store and mergeRules() folds it back over these defaults on load.
export const DEFAULT_RULES = {
  holdKeywords: [
    'anrufen', 'telefon', 'phone', 'call', 'keine email', 'no email',
    'nicht emailen', 'nicht mailen', 'vorerst keine', 'erstmal keine',
    "dont email", "don't email", 'nächstes jahr', 'next year', 'frühestens',
    'warten', 'wait', 'später', 'later', 'pause', 'kein outreach',
    'already in contact', 'already talking', 'bereits in kontakt', 'schon in kontakt',
    'erst nächstes jahr', 'im austausch', 'ongoing conversation',
    'keine reminder', 'kein reminder', 'no reminder', 'no reminders',
    'melden sich bei interesse', 'will get back', 'they will get back',
  ],
  holdOverrideDays: 365,
  defaultFrequencyDays: 30,
  recentlyPlayedDays: 365,
  festivalPastMonths: 2,
  festivalFutureMonths: 3,
  batchSize: 10,
  batchSortKeys: ['Country', 'City', 'Venue'],
  dateColors: {
    lastEmailedFreshRatio: 0.5,
    lastEmailedWarnRatio: 1,
    lastEmailedOverdueRatio: 2,
    lastPlayedRedDays: 182,
    lastPlayedOrangeDays: 365,
    lastReplyGreenDays: 30,
    lastReplyLimeDays: 90,
    lastReplyOrangeDays: 365,
    followUpDueRedAfterDays: 7,
    followUpPendingGreenBeforeDays: 14,
  },
}

// Columns the batch may be sorted by (also the options offered in the editor).
export const BATCH_SORT_KEY_OPTIONS = ['Country', 'City', 'Venue', 'Band', 'Type']

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// Deep-merge a stored rules object over the defaults, keeping only keys the
// defaults know about. Unknown keys (from a future or corrupted config) are
// dropped rather than silently changing behaviour.
export function mergeRules(stored) {
  const out = { ...DEFAULT_RULES, dateColors: { ...DEFAULT_RULES.dateColors } }
  if (!isPlainObject(stored)) return out
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in DEFAULT_RULES)) continue
    if (key === 'dateColors') {
      if (!isPlainObject(value)) continue
      for (const [k, v] of Object.entries(value)) {
        if (k in DEFAULT_RULES.dateColors && typeof v === 'number' && Number.isFinite(v)) {
          out.dateColors[k] = v
        }
      }
      continue
    }
    if (key === 'holdKeywords') {
      if (!Array.isArray(value)) continue
      out.holdKeywords = value.map(k => String(k).trim().toLowerCase()).filter(Boolean)
      continue
    }
    if (key === 'batchSortKeys') {
      if (!Array.isArray(value)) continue
      out.batchSortKeys = value.map(String).filter(Boolean)
      continue
    }
    if (typeof value === typeof DEFAULT_RULES[key]) out[key] = value
  }
  return out
}

const POSITIVE_INTS = [
  ['holdOverrideDays', 'Hold override'],
  ['defaultFrequencyDays', 'Default frequency'],
  ['recentlyPlayedDays', 'Recently played'],
  ['batchSize', 'Batch size'],
]
const NON_NEGATIVE_INTS = [
  ['festivalPastMonths', 'Festival past months'],
  ['festivalFutureMonths', 'Festival future months'],
]

// → array of human-readable error strings ([] when the rules are usable).
// The Rules editor shows these inline and blocks Save while any exist.
export function validateRules(rules, t = plainT) {
  const errors = []
  if (!isPlainObject(rules)) return [t('Rules must be an object.')]

  for (const [key, label] of POSITIVE_INTS) {
    const v = rules[key]
    if (!Number.isInteger(v) || v < 1) errors.push(t('{label} must be a whole number of at least 1.', { label: t(label) }))
  }
  for (const [key, label] of NON_NEGATIVE_INTS) {
    const v = rules[key]
    if (!Number.isInteger(v) || v < 0) errors.push(t('{label} must be a whole number of 0 or more.', { label: t(label) }))
  }

  if (!Array.isArray(rules.holdKeywords)) {
    errors.push(t('Hold keywords must be a list.'))
  } else if (rules.holdKeywords.some(k => typeof k !== 'string' || !k.trim())) {
    errors.push(t('Hold keywords must all be non-empty text.'))
  }

  if (!Array.isArray(rules.batchSortKeys) || rules.batchSortKeys.length === 0) {
    errors.push(t('Pick at least one column to sort the next batch by.'))
  } else if (rules.batchSortKeys.some(k => !BATCH_SORT_KEY_OPTIONS.includes(k))) {
    errors.push(t('Batch sort columns must be one of: {columns}.', { columns: BATCH_SORT_KEY_OPTIONS.join(', ') }))
  }

  const dc = rules.dateColors
  if (!isPlainObject(dc)) {
    errors.push(t('Date colors must be an object.'))
  } else {
    for (const key of Object.keys(DEFAULT_RULES.dateColors)) {
      const v = dc[key]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        errors.push(t('Date color “{key}” must be a number of 0 or more.', { key }))
      }
    }
    if (dc.lastEmailedFreshRatio > dc.lastEmailedWarnRatio || dc.lastEmailedWarnRatio > dc.lastEmailedOverdueRatio) {
      errors.push(t('Last-emailed color ratios must increase: fresh ≤ warn ≤ overdue.'))
    }
    if (dc.lastPlayedRedDays > dc.lastPlayedOrangeDays) {
      errors.push(t('Last-played red threshold must not exceed the orange one.'))
    }
    if (dc.lastReplyGreenDays > dc.lastReplyLimeDays || dc.lastReplyLimeDays > dc.lastReplyOrangeDays) {
      errors.push(t('Last-reply color thresholds must increase: green ≤ lime ≤ orange.'))
    }
  }

  return errors
}
