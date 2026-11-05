import { DEFAULT_RULES } from './rules.js'
import { plainT } from './tr.js'

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

// Colours: the row's background already speaks for the venue's answers
// (lib/health.js: green booked, yellow replied, orange auto-reply, red never
// replied), so a status never uses those four for something else — except
// Confirmed, which is the same news as a booked gig and takes its green.
// What to do is indigo (Send, like the Email button), pink (Follow up),
// violet (Never contacted), cyan (Missing info); the resting ones are grey.
export const STATUS_META = {
  [STATUS.SEND]: {
    label: 'Send',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    row: 'border-l-4 border-indigo-400',
    mapColor: '#6366F1',
    priority: 1,
  },
  [STATUS.FOLLOW_UP_DUE]: {
    label: 'Follow up',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    row: 'border-l-4 border-pink-500',
    mapColor: '#EC4899',
    priority: 2,
  },
  [STATUS.NEVER_CONTACTED]: {
    label: 'Never contacted',
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
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    row: '',
    mapColor: '#6B7280',
    priority: 5,
  },
  [STATUS.ON_HOLD]: {
    label: 'On hold',
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    row: 'opacity-60',
    mapColor: '#9CA3AF',
    priority: 6,
  },
  [STATUS.CONFIRMED]: {
    label: 'Confirmed',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    row: '',
    mapColor: '#22C55E',
    priority: 6.5,
  },
  [STATUS.RECENTLY_PLAYED]: {
    label: 'Recently played',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    row: 'opacity-70',
    mapColor: '#14B8A6',
    priority: 7,
  },
  [STATUS.FESTIVAL_INELIGIBLE]: {
    label: 'Festival (not now)',
    badge: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    row: 'opacity-70',
    mapColor: '#A8A29E',
    priority: 8,
  },
  [STATUS.FILLER_OFF]: {
    label: 'Not for this band',
    badge: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    row: 'opacity-60',
    mapColor: '#A8A29E',
    priority: 8.5,
  },
  [STATUS.MISSING_INFO]: {
    label: 'Missing info',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    row: 'border-l-4 border-cyan-400',
    mapColor: '#06B6D4',
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
// baked into the text. StatsBar and the Rules editor render these; `t`
// translates them (see tr.js).
const STATUS_DESCRIPTIONS = {
  [STATUS.SEND]: (r, t) => t('Last contacted more than {days} days ago (or the venue’s own Frequency) — eligible to email again.', { days: r.defaultFrequencyDays }),
  [STATUS.FOLLOW_UP_DUE]: (r, t) => t('Scheduled follow-up date has passed — time to check in.'),
  [STATUS.NEVER_CONTACTED]: (r, t) => t('No outreach on record — fresh candidate for a first email.'),
  [STATUS.FOLLOW_UP_PENDING]: (r, t) => t('Follow-up date is set in the future — check back then.'),
  [STATUS.RECENT_CONTACT]: (r, t) => t('Emailed within the last {days} days (or the venue’s own Frequency) — too soon to follow up.', { days: r.defaultFrequencyDays }),
  [STATUS.ON_HOLD]: (r, t) => t('Note contains a hold marker (e.g. {examples}) — skipped for outreach until {days} days have passed.', { examples: r.holdKeywords.slice(0, 3).map(k => `"${k}"`).join(', '), days: r.holdOverrideDays }),
  [STATUS.CONFIRMED]: (r, t) => t('Last Played is a date still to come — a confirmed gig. Skipped for booking outreach.'),
  [STATUS.RECENTLY_PLAYED]: (r, t) => t('Last played less than {days} days ago — skipped for booking outreach until then.', { days: r.recentlyPlayedDays }),
  [STATUS.FESTIVAL_INELIGIBLE]: (r, t) => t('Festival booking window is not open right now — must be more than {future} months out or more than {past} months past.', { future: r.festivalFutureMonths, past: r.festivalPastMonths }),
  [STATUS.FILLER_OFF]: (r, t) => t('Only some bands book venues of this type (Settings ▸ Venue types ▸ Booked by), and this venue’s band isn’t one of them — kept out of every send/follow-up list.'),
  [STATUS.MISSING_INFO]: (r, t) => t('Can’t be emailed yet: the venue name, band or a real email address is missing, or its band has no Dates or no mail template. Hover the red “!” to see what — hidden from send/follow-up lists until it’s fixed.'),
  [STATUS.DEAD]: (r, t) => t('Its type is never contacted (Settings ▸ Venue types) — no longer being booked, excluded from all outreach.'),
}

export function describeStatus(status, rules = DEFAULT_RULES, t = plainT) {
  return STATUS_DESCRIPTIONS[status]?.(rules, t) || ''
}

// The colours chips and statuses can be given; the classes for each are in
// src/renderer/src/lib/palette.js.
export const CHIP_HUES = ['gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'pink', 'rose']

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
  { key: 'Status', label: 'Reply Status' },
  { key: 'Total emails', label: 'Total Emails', type: 'number' },
  { key: 'Recent emails', label: 'Recent Emails (since last reply)', type: 'number' },
  { key: 'Last emailed', label: 'Last Emailed', type: 'date' },
  { key: 'Follow Up Date', label: 'Follow Up', type: 'date' },
  { key: 'Last played', label: 'Last Played', type: 'date' },
  { key: 'Time Frame', label: 'Time Frame' },
  { key: 'Dates', label: 'Dates' },
  { key: 'Text', label: 'Outreach Text' },
  { key: 'frequency', label: 'Follow-up Interval' },
]

// One label per CSV column, used by every screen that names a field (venue
// panel, bulk edit, merge, save, filters), so a column is called the same
// everywhere.
export const FIELD_LABELS = {
  Venue: 'Venue',
  Band: 'Band',
  Type: 'Type',
  City: 'City',
  Country: 'Country',
  Contact: 'Contact',
  Email: 'Email',
  Website: 'Website',
  'Time Frame': 'Time Frame',
  Dates: 'Dates',
  Text: 'Outreach Text',
  'Last emailed': 'Last Emailed',
  'Follow Up Date': 'Follow Up',
  frequency: 'Follow-up Interval',
  'Last played': 'Last Played',
  Status: 'Reply Status',
  Note: 'Note',
  'Total emails': 'Total Emails',
  'Recent emails': 'Recent Emails',
  Draft: 'Next Batch',
  Auto: 'Auto-send',
  filler: 'Filler',
}
export const fieldLabel = key => FIELD_LABELS[key] || key

// The app's real CSV columns, in canonical order. Single source of truth for the
// import wizard's mapping targets and the key set every imported row carries.
export const APP_COLUMNS = [
  'Venue', 'Band', 'Type', 'City', 'Country', 'Contact', 'Email', 'Website', 'Time Frame', 'Dates', 'Text',
  'Last emailed', 'Follow Up Date', 'frequency', 'Last played', 'Status', 'Note', 'Total emails', 'Recent emails',
  'Draft', 'Auto', 'filler',
].map(key => ({ key, label: fieldLabel(key) }))

export const CRITICAL_FIELDS = ['Venue', 'Email', 'Band', 'Contact']

// Every address in an Email cell. A cell may hold several ("a@x.de, b@x.de") —
// and often holds none: "tbd", "n/a", "see website". Only what looks like an
// address counts, so those read as a missing email.
const EMAIL_RE = /[^\s<>(),;:"']+@[^\s<>(),;:"'@]+\.[a-z]{2,}/gi
export function emailAddresses(value) {
  return [...new Set(String(value || '').match(EMAIL_RE) || [])]
}

// Venues reached some other way than email: a form on their website, or a
// message on Instagram, WhatsApp and the like ("Other channel"), or only by
// phone ("Phone only"). They are not missing an email — there is none to
// have — but they can't be drafted.
const ONLINE_FORM_RE = /\b(online|web|contact|kontakt)[\s-]*form|\bformul[a-z]*\b|\bform only\b|\bvia form\b|\bnur (über )?formular|https?:\/\//i
// A Note is prose, so it is read more strictly: no bare links (notes are full
// of them) and no loose "formul…" ("anders formulieren").
const NOTE_FORM_RE = /\b(online|web|contact|kontakt)[\s-]*form(ular)?\b|\bformular\b|\bform only\b|\bvia (web)?form\b|\bnur (über )?(das )?formular|\banfrage über (das )?formular/i
function noteSaysForm(row) {
  return NOTE_FORM_RE.test(String(row?.['Note'] || ''))
}

// Messaging apps and social networks, with the name the venue banner shows.
const MESSENGERS = [
  [/\b(instagram|insta)\b/i, 'Instagram'],
  [/\bwhats\s?app\b/i, 'WhatsApp'],
  [/\b(facebook|fb)\b/i, 'Facebook'],
  [/\bmessenger\b/i, 'Messenger'],
  [/\bsignal\b/i, 'Signal'],
  [/\btelegram\b/i, 'Telegram'],
  [/\blinked\s?in\b/i, 'LinkedIn'],
  [/\b(tiktok|tik tok)\b/i, 'TikTok'],
  [/\b(dm|pn)\b/i, ''],
]
const MESSENGER_NAMES = 'instagram|insta|whats\\s?app|facebook|fb|messenger|signal|telegram|linked\\s?in|social\\s?media'
// In a Note only a phrase that says how to reach them counts: "via Instagram",
// "über WhatsApp", "Instagram DM", "Instagram @club", not every mention of
// the venue's Instagram. A venue reachable by phone *or* a message counts here.
const NOTE_MESSENGER_RE = new RegExp(`(?:^|[\\s(,;:])(via|über|per|on|auf|through|only|nur)\\s+(${MESSENGER_NAMES})\\b|\\b(${MESSENGER_NAMES})[\\s-]*(dm|only|message|nachricht|pn)\\b|\\b(${MESSENGER_NAMES})[\\s:(-]*@[\\w.]+`, 'i')
function messengerIn(text) {
  for (const [re, name] of MESSENGERS) if (re.test(text)) return name || 'DM'
  return ''
}

const PHONE_RE = /\b(phone|telephone|tel\.?|telefon|telefonisch|anrufen|call|by phone)\b|\+?\d[\d\s/().-]{6,}\d/i
const NOTE_PHONE_RE = /\b(nur|only)\s+(per\s+|by\s+|über\s+)?(telefon|telefonisch|phone|tel\.?|anrufen)\b|\bphone only\b|\b(by|per) phone only\b|\bnur telefonisch\b|\bnur anrufen\b/i

// How a venue without an email address is reached:
// { kind: 'form' | 'message' | 'phone', name } — name is "Instagram" etc. for
// messages — or null (an email address, or nothing that says).
export function contactChannel(row) {
  const email = String(row?.['Email'] || '')
  if (emailAddresses(email).length) return null
  const contact = String(row?.['Contact'] || '')
  const note = String(row?.['Note'] || '')
  if (ONLINE_FORM_RE.test(email) || ONLINE_FORM_RE.test(contact)) return { kind: 'form', name: '' }
  const messenger = messengerIn(email)
  if (messenger) return { kind: 'message', name: messenger }
  if (PHONE_RE.test(email)) return { kind: 'phone', name: '' }
  if (noteSaysForm(row)) return { kind: 'form', name: '' }
  if (NOTE_MESSENGER_RE.test(note)) return { kind: 'message', name: messengerIn(note) }
  if (NOTE_PHONE_RE.test(note)) return { kind: 'phone', name: '' }
  return null
}
// "Other channel": a form or a message app.
export function isOtherChannel(row) {
  const c = contactChannel(row)
  return !!c && c.kind !== 'phone'
}
export function isPhoneOnly(row) {
  return contactChannel(row)?.kind === 'phone'
}
// The form's address, when the Email or Contact cell holds one — or the Note,
// when it is the Note that says the venue takes a form.
export function onlineFormUrl(row) {
  const cells = [row?.['Email'], row?.['Contact']]
  if (noteSaysForm(row)) cells.push(row?.['Note'])
  for (const v of cells) {
    const m = String(v || '').match(/https?:\/\/\S+/i)
    if (m) return m[0].replace(/[),.;]+$/, '')
  }
  return ''
}

function hasEmail(row) {
  return emailAddresses(row?.['Email']).length > 0 || !!contactChannel(row)
}

// Why an outreach email can't be sent to this venue, as field names: the red
// "!" lists them and any of them makes the venue MISSING_INFO.
// `ctx` (all optional, see classifyContext in classify.js):
//   bandsWithDates      lower-cased bands with Dates set; a venue with no Dates
//                       of its own needs its band to have some
//   bandsWithTemplates  lower-cased bands with a mail template; null = not
//                       known (web, or templates not loaded) → not checked
export function sendBlockers(row, ctx = {}) {
  const out = []
  if (!row?.['Venue']?.trim()) out.push('Venue')
  const band = String(row?.['Band'] || '').trim().toLowerCase()
  if (!band) out.push('Band')
  if (!hasEmail(row)) out.push('Email')
  if (band && !row?.['Dates']?.trim() && ctx.bandsWithDates && !ctx.bandsWithDates.has(band)) out.push('Dates')
  if (band && ctx.bandsWithTemplates && !ctx.bandsWithTemplates.has(band)) out.push('Template')
  return out
}

export function isSendBlocked(row, ctx) {
  return sendBlockers(row, ctx).length > 0
}

// What the "Incomplete details" chip and the red "!" show: everything that
// blocks sending, plus a missing contact or location, which don't.
export function getMissingFields(row, ctx) {
  const missing = sendBlockers(row, ctx)
  if (!row?.['Contact']?.trim()) missing.push('Contact')
  if (!row?.['City']?.trim() && !row?.['Country']?.trim()) missing.push('Location')
  return missing
}

// 3 = red (venue/email), 2 = orange (band, its Dates or template), 1 = yellow
// (contact/location), 0 = none
export function getMissingSeverity(row, ctx) {
  const missing = getMissingFields(row, ctx)
  if (missing.includes('Venue') || missing.includes('Email')) return 3
  if (missing.some(f => f === 'Band' || f === 'Dates' || f === 'Template')) return 2
  return missing.length ? 1 : 0
}

// The same list in words, for the red "!" and the venue panel.
const MISSING_WORDS = {
  Email: t => t('a real email address'),
  Dates: t => t('Dates (its band has none either)'),
  Template: t => t('a mail template for its band'),
}
export function describeMissing(missing, t = plainT) {
  return missing.map(f => MISSING_WORDS[f]?.(t) || t(fieldLabel(f))).join(', ')
}
