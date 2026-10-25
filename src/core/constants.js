import { DEFAULT_RULES } from './rules.js'

// Frequency column → re-contact window in days. Empty/unset falls back to the
// configured default. Presets and custom values are stored as "N months"
// (e.g. "2 months"); a "N days" form is also accepted for robustness.
export function frequencyToDays(freq, rules = DEFAULT_RULES) {
  const fallback = rules.defaultFrequencyDays
  if (!freq) return fallback
  const m = String(freq).match(/(\d+)/)
  if (!m) return fallback
  const n = parseInt(m[1], 10)
  if (!n) return fallback
  return /day/i.test(freq) ? n : n * 30
}

export const STATUS = {
  SEND: 'SEND',
  FOLLOW_UP_DUE: 'FOLLOW_UP_DUE',
  FOLLOW_UP_PENDING: 'FOLLOW_UP_PENDING',
  NEVER_CONTACTED: 'NEVER_CONTACTED',
  ON_HOLD: 'ON_HOLD',
  RECENT_CONTACT: 'RECENT_CONTACT',
  CONFIRMED: 'CONFIRMED',
  RECENTLY_PLAYED: 'RECENTLY_PLAYED',
  FESTIVAL_INELIGIBLE: 'FESTIVAL_INELIGIBLE',
  FILLER_OFF: 'FILLER_OFF',
  MISSING_INFO: 'MISSING_INFO',
  DEAD: 'DEAD',
}

export const STATUS_META = {
  [STATUS.SEND]: {
    label: 'Send',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    row: 'border-l-4 border-amber-400',
    mapColor: '#F59E0B',
    priority: 1,
  },
  [STATUS.FOLLOW_UP_DUE]: {
    label: 'Follow Up',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    row: 'border-l-4 border-red-500',
    mapColor: '#EF4444',
    priority: 2,
  },
  [STATUS.NEVER_CONTACTED]: {
    label: 'Never Contacted',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    row: 'border-l-4 border-violet-400',
    mapColor: '#8B5CF6',
    priority: 3,
  },
  [STATUS.FOLLOW_UP_PENDING]: {
    label: 'Waiting',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    row: '',
    mapColor: '#3B82F6',
    priority: 4,
  },
  [STATUS.RECENT_CONTACT]: {
    label: 'Recent',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    row: '',
    mapColor: '#22C55E',
    priority: 5,
  },
  [STATUS.ON_HOLD]: {
    label: 'On Hold',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    row: 'opacity-60',
    mapColor: '#9CA3AF',
    priority: 6,
  },
  [STATUS.CONFIRMED]: {
    label: 'Confirmed',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    row: '',
    mapColor: '#EC4899',
    priority: 6.5,
  },
  [STATUS.RECENTLY_PLAYED]: {
    label: 'Recently Played',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    row: 'opacity-70',
    mapColor: '#14B8A6',
    priority: 7,
  },
  [STATUS.FESTIVAL_INELIGIBLE]: {
    label: 'Festival (not now)',
    badge: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
    row: 'opacity-70',
    mapColor: '#0EA5E9',
    priority: 8,
  },
  [STATUS.FILLER_OFF]: {
    label: 'Filler (not booking)',
    badge: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    row: 'opacity-60',
    mapColor: '#A8A29E',
    priority: 8.5,
  },
  [STATUS.MISSING_INFO]: {
    label: 'Missing Info',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    row: 'border-l-4 border-orange-400',
    mapColor: '#FB923C',
    priority: 9,
  },
  [STATUS.DEAD]: {
    label: 'Dead',
    badge: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
    row: 'opacity-50',
    mapColor: '#A1A1AA',
    priority: 10,
  },
}

// Status blurbs, with every threshold read from the active rules rather than
// baked into the text. StatsBar and the Rules editor render these.
const STATUS_DESCRIPTIONS = {
  [STATUS.SEND]: r => `Last contacted more than ${r.defaultFrequencyDays} days ago (or the venue's own Frequency) — eligible to email again.`,
  [STATUS.FOLLOW_UP_DUE]: () => 'Scheduled follow-up date has passed — time to check in.',
  [STATUS.NEVER_CONTACTED]: () => 'No outreach on record — fresh candidate for a first email.',
  [STATUS.FOLLOW_UP_PENDING]: () => 'Follow-up date is set in the future — check back then.',
  [STATUS.RECENT_CONTACT]: r => `Emailed within the last ${r.defaultFrequencyDays} days (or the venue's own Frequency) — too soon to follow up.`,
  [STATUS.ON_HOLD]: r => `Note contains a hold marker (e.g. ${r.holdKeywords.slice(0, 3).map(k => `"${k}"`).join(', ')}) — skipped for outreach until ${r.holdOverrideDays} days have passed.`,
  [STATUS.CONFIRMED]: () => 'Last Played is a date still to come — a confirmed gig. Skipped for booking outreach.',
  [STATUS.RECENTLY_PLAYED]: r => `Last played less than ${r.recentlyPlayedDays} days ago — skipped for booking outreach until then.`,
  [STATUS.FESTIVAL_INELIGIBLE]: r => `Festival booking window is not open right now — must be more than ${r.festivalFutureMonths} months out or more than ${r.festivalPastMonths} months past.`,
  [STATUS.FILLER_OFF]: () => 'A filler venue, and its band is not booking filler venues right now (Settings ▸ Bands ▸ "Book filler venues") — kept out of every send/follow-up list until it is.',
  [STATUS.MISSING_INFO]: () => 'Missing a field required to send (venue name, band, or email). Fix the flagged fields before it can be emailed — hidden from send/follow-up lists until then.',
  [STATUS.DEAD]: () => 'Type is set to "dead" — no longer being booked, excluded from all outreach.',
}

export function describeStatus(status, rules = DEFAULT_RULES) {
  return STATUS_DESCRIPTIONS[status]?.(rules) || ''
}

export const ACTION_STATUSES = new Set([STATUS.SEND, STATUS.FOLLOW_UP_DUE, STATUS.NEVER_CONTACTED])

// Columns offered in the advanced filter/sort panel. `type` drives how the
// value is compared: 'status' = classification priority, 'date' = parsed date,
// otherwise case-insensitive substring (filter) / locale string (sort).
// Reply-health categories (see replyHealth() in replyStatus.js). Order = sort rank,
// from best news (confirmed gig) to worst (no response).
export const HEALTH_OPTIONS = [
  { key: 'gig', label: 'Gig booked' },
  { key: 'reply', label: 'Replied' },
  { key: 'none', label: 'Not contacted yet' },
  { key: 'auto-reply', label: 'Auto-reply only' },
  { key: 'silent', label: 'Never replied' },
]
export const HEALTH_RANK = Object.fromEntries(HEALTH_OPTIONS.map((o, i) => [o.key, i]))

export const ADVANCED_COLUMNS = [
  { key: '_status', label: 'Status badge (Send/Follow-up/…)', type: 'status' },
  { key: '_health', label: 'Reply health (color)', type: 'health' },
  { key: 'Venue', label: 'Venue' },
  { key: 'City', label: 'City' },
  { key: 'Country', label: 'Country' },
  { key: 'Band', label: 'Band' },
  { key: 'Email', label: 'Email' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Website', label: 'Website' },
  { key: 'Type', label: 'Type' },
  { key: 'Note', label: 'Note' },
  { key: 'Status', label: 'Last Reply' },
  { key: 'Total emails', label: 'Total Emails', type: 'number' },
  { key: 'Recent emails', label: 'Recent Emails (since last reply)', type: 'number' },
  { key: 'Last emailed', label: 'Last Emailed', type: 'date' },
  { key: 'Follow Up Date', label: 'Follow Up', type: 'date' },
  { key: 'Last played', label: 'Last Played', type: 'date' },
  { key: 'Time Frame', label: 'Time Frame' },
  { key: 'Dates', label: 'Dates' },
  { key: 'Text', label: 'Text' },
  { key: 'frequency', label: 'Frequency' },
]

// The app's real CSV columns, in canonical order. Single source of truth for the
// import wizard's mapping targets and the key set every imported row carries.
export const APP_COLUMNS = [
  { key: 'Venue', label: 'Venue' },
  { key: 'Band', label: 'Band' },
  { key: 'Type', label: 'Type' },
  { key: 'City', label: 'City' },
  { key: 'Country', label: 'Country' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Email', label: 'Email' },
  { key: 'Website', label: 'Website' },
  { key: 'Time Frame', label: 'Time Frame' },
  { key: 'Dates', label: 'Dates' },
  { key: 'Text', label: 'Outreach text' },
  { key: 'Last emailed', label: 'Last Emailed' },
  { key: 'Follow Up Date', label: 'Follow Up Date' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'Last played', label: 'Last Played' },
  { key: 'Status', label: 'Reply status' },
  { key: 'Note', label: 'Note' },
  { key: 'Total emails', label: 'Total Emails' },
  { key: 'Recent emails', label: 'Recent Emails' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Auto', label: 'Auto' },
  { key: 'filler', label: 'filler' },
]

export const CRITICAL_FIELDS = ['Venue', 'Email', 'Band', 'Contact']

// Fields without which an outreach email cannot be sent at all. A venue missing
// any of these is hidden from the send/follow-up lists (classified MISSING_INFO)
// and surfaced only via the red "!" flag and the Missing info filter.
export const SEND_REQUIRED_FIELDS = ['Venue', 'Band', 'Email']

export function isSendBlocked(row) {
  return SEND_REQUIRED_FIELDS.some(f => !row[f]?.trim())
}

export function getMissingFields(row) {
  const missing = []
  CRITICAL_FIELDS.forEach(f => { if (!row[f]?.trim()) missing.push(f) })
  if (!row['City']?.trim() && !row['Country']?.trim()) missing.push('Location')
  return missing
}

// 3 = red (venue/email), 2 = orange (band), 1 = yellow (contact/location), 0 = none
export function getMissingSeverity(row) {
  if (!row['Venue']?.trim() || !row['Email']?.trim()) return 3
  if (!row['Band']?.trim()) return 2
  if (!row['Contact']?.trim() || (!row['City']?.trim() && !row['Country']?.trim())) return 1
  return 0
}
