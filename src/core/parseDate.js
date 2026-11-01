import { parse, isValid, format } from 'date-fns'
import { de } from 'date-fns/locale'

// The CSV always stores a day as dd.MM.yy (formatDateDDMMYY). How one is shown
// and how a slash date is read follow the date order picked in Settings ▸
// General (lib/dateOrder.js): day first (31.12.26) or month first (12/31/26).
// Dotted dates are always day first; only "11/01/26" is ambiguous.
let dayFirst = true
export function setDateOrder(order) { dayFirst = order !== 'mdy' }
export function getDateOrder() { return dayFirst ? 'dmy' : 'mdy' }

const SLASH_DMY = ['dd/MM/yy', 'dd/MM/yyyy']
const SLASH_MDY = ['MM/dd/yy', 'MM/dd/yyyy']
const formats = () => [
  'dd.MM.yy',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'd.M.yy',
  'yyyy-MM-dd',
  ...(dayFirst ? [...SLASH_DMY, ...SLASH_MDY] : [...SLASH_MDY, ...SLASH_DMY]),
  'MMMM yy',
  'MMMM yyyy',
  'd MMMM yyyy',
  'd. MMMM yyyy',
  'yyyy',
]

const REF = new Date(2000, 0, 1)

export function parseDate(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.trim()
  if (!s) return null
  // A full ISO timestamp (the draft log writes these) carries a time of day the
  // day-only formats below would throw away.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const iso = new Date(s)
    if (isValid(iso)) return iso
  }
  for (const fmt of formats()) {
    // Try English (default) then German, so month names like "Juni 2027" parse.
    for (const opts of [undefined, { locale: de }]) {
      try {
        const d = parse(s, fmt, REF, opts)
        if (isValid(d)) return d
      } catch {
        // try next format / locale
      }
    }
  }
  return null
}

// Formats that name a day, as opposed to "September 2026" or "2027".
const dayFormats = () => formats().filter(f => /d/.test(f))

function parseDay(s) {
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && isValid(new Date(s))) return new Date(s)
  for (const fmt of dayFormats()) {
    for (const opts of [undefined, { locale: de }]) {
      try {
        const d = parse(s, fmt, REF, opts)
        if (isValid(d)) return d
      } catch {
        // try next format / locale
      }
    }
  }
  return null
}

// What a typed date field stores: a day in any format becomes dd.MM.yy, like a
// picked one; anything else ("September 2026", "2027", "tba") is kept as typed.
export function normalizeDateText(str) {
  const s = (str || '').trim()
  if (!s) return ''
  const d = parseDay(s)
  return d ? formatDateDDMMYY(d) : s
}

// How a date field shows its value: a day in the chosen order, anything vaguer
// as written — "September 2026" must not turn into 01.09.26.
export function displayDateText(str) {
  const s = (str || '').trim()
  if (!s) return ''
  const d = parseDay(s)
  return d ? formatDay(d) : s
}

// A day as shown on screen (never as stored): 31.12.26 or 12/31/26.
export function formatDay(d) {
  if (!d || !isValid(d)) return ''
  return format(d, dayFirst ? 'dd.MM.yy' : 'MM/dd/yy')
}

export function formatDateDDMMYY(d) {
  if (!d || !isValid(d)) return ''
  return format(d, 'dd.MM.yy')
}

export function toInputValue(str) {
  const d = parseDate(str)
  if (!d) return ''
  return format(d, 'yyyy-MM-dd')
}

export function fromInputValue(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

export function parseMonthsFromTimeFrame(str) {
  if (!str) return []
  const MONTHS = [
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ]
  const lower = str.toLowerCase()
  const found = []
  MONTHS.forEach((m, i) => {
    if (lower.includes(m)) {
      found.push(i % 12)
    }
  })
  return [...new Set(found)]
}
