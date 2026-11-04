// {{dates}} for one venue: the band's Dates, narrowed to what the venue's Time
// Frame allows. A club that only books Wednesdays gets the Wednesdays inside
// the band's tour windows; a festival whose Time Frame names its own days gets
// the days both share. Whenever the Time Frame says nothing usable, or nothing
// fits, the Dates text goes out exactly as written.

const WEEKDAY_WORDS = [
  // [index (0 = Sunday), full names (any language), 3-letter English, 2-letter German]
  [1, ['monday', 'montag'], ['mon'], ['mo']],
  [2, ['tuesday', 'dienstag'], ['tue', 'tues'], ['di']],
  [3, ['wednesday', 'mittwoch'], ['wed'], ['mi']],
  [4, ['thursday', 'donnerstag'], ['thu', 'thur', 'thurs'], ['do']],
  [5, ['friday', 'freitag'], ['fri'], ['fr']],
  [6, ['saturday', 'samstag', 'sonnabend'], ['sat'], ['sa']],
  [0, ['sunday', 'sonntag'], ['sun'], ['so']],
]
const WORD_TO_DAY = new Map()
const SHORT_TO_DAY = new Map()
for (const [day, full, three, two] of WEEKDAY_WORDS) {
  for (const w of [...full, ...three]) WORD_TO_DAY.set(w, day)
  for (const w of two) SHORT_TO_DAY.set(w, day)
}
const NEGATION = /\b(no|not|except|kein|keine|nicht|außer|ausser|ohne)\s*$/i

// A weekday word: full names with an optional plural/adverb "s" ("Fridays",
// "dienstags"), 3-letter English with an optional ".". The 2-letter German
// forms ("Mi/Do/Fr") are words of their own too often ("so", "do"), so they
// count only next to another weekday.
function dayOf(word, { short = false } = {}) {
  const w = word.toLowerCase().replace(/\.$/, '')
  const bare = w.replace(/s$/, '')
  if (WORD_TO_DAY.has(w)) return WORD_TO_DAY.get(w)
  if (WORD_TO_DAY.has(bare)) return WORD_TO_DAY.get(bare)
  if (short && SHORT_TO_DAY.has(w)) return SHORT_TO_DAY.get(w)
  return null
}

function spanDays(a, b) {
  const out = []
  for (let d = a; ; d = (d + 1) % 7) {
    out.push(d)
    if (d === b || out.length > 7) break
  }
  return out
}

// → { include: Set, exclude: Set } of weekday numbers (0 = Sunday).
export function weekdaysIn(text) {
  const include = new Set()
  const exclude = new Set()
  const s = String(text || '')
  const tokens = [...s.matchAll(/[\p{L}]+\.?/gu)]
  // Which tokens are weekdays; 2-letter ones only beside another weekday.
  const days = tokens.map(m => dayOf(m[0]))
  const shorts = tokens.map(m => dayOf(m[0], { short: true }))
  const gapAt = i => s.slice(tokens[i].index + tokens[i][0].length, tokens[i + 1]?.index ?? s.length)
  const joined = i => i < tokens.length - 1 && /^\s*([/,&+–—-]|und|and|bis|to)?\s*$/i.test(gapAt(i))
  for (let i = 0; i < tokens.length; i++) {
    if (days[i] !== null || shorts[i] === null) continue
    const left = i > 0 && shorts[i - 1] !== null && joined(i - 1)
    const right = shorts[i + 1] != null && joined(i)
    if (left || right) days[i] = shorts[i]
  }
  for (let i = 0; i < tokens.length; i++) {
    if (days[i] === null) continue
    const negated = NEGATION.test(s.slice(0, tokens[i].index))
    // "Mi-Fr", "Wed to Fri", "Do bis Sa": the whole span.
    const range = i < tokens.length - 1 && days[i + 1] !== null && /^\s*(–|—|-|bis|to)\s*$/i.test(gapAt(i))
    const set = negated ? exclude : include
    if (range) {
      spanDays(days[i], days[i + 1]).forEach(d => set.add(d))
      i += 1
    } else {
      set.add(days[i])
    }
  }
  if (/\b(weekends?|wochenenden?)\b/i.test(s)) [5, 6, 0].forEach(d => include.add(d))
  if (/\b(weekdays|werktags|unter der woche)\b/i.test(s)) [1, 2, 3, 4, 5].forEach(d => include.add(d))
  return { include, exclude }
}

// "12. - 20.6.27", "30.3. - 9.4.28", "24.–27.09.2026", "14.6.27", "14.6."
// → [{ start, end }] as day/month/year parts (year may be null), or null when a
// piece can't be read.
const DATE_PART = String.raw`(\d{1,2})\.(?:\s*(\d{1,2})\.(?:\s*(\d{2}|\d{4})\b)?)?`
const RANGE_RE = new RegExp(String.raw`${DATE_PART}(?:\s*[–—-]\s*|\s+bis\s+)${DATE_PART}|${DATE_PART}`, 'g')

function year(y) {
  if (!y) return null
  const n = Number(y)
  return n < 100 ? 2000 + n : n
}

export function dateRangesIn(text) {
  const out = []
  for (const m of String(text || '').matchAll(RANGE_RE)) {
    if (m[1] !== undefined) {
      const end = { d: +m[4], m: m[5] ? +m[5] : null, y: year(m[6]) }
      if (!end.m) continue
      const start = { d: +m[1], m: m[2] ? +m[2] : end.m, y: year(m[3]) ?? end.y }
      out.push({ start, end })
    } else {
      const one = { d: +m[7], m: m[8] ? +m[8] : null, y: year(m[9]) }
      if (!one.m) continue // a lone "12." is not a date
      out.push({ start: one, end: one })
    }
  }
  return out
}

const MAX_DAYS = 800

// Every day of the band's Dates, in order, or null when the text holds
// anything that isn't a full date or range (then nothing is narrowed).
function daysOf(datesText) {
  const ranges = dateRangesIn(datesText)
  if (!ranges.length) return null
  // What's left once the dates are taken out must be just separators.
  const rest = String(datesText).replace(RANGE_RE, '').replace(/[\s;,&/+]|und|and/gi, '')
  if (rest) return null
  const days = []
  for (const { start, end } of ranges) {
    if (!end.y || !start.y) return null
    let d = new Date(start.y, start.m - 1, start.d)
    // "30.12. - 3.1.27": the start belongs to the year before.
    let last = new Date(end.y, end.m - 1, end.d)
    if (d > last) d = new Date(start.y - 1, start.m - 1, start.d)
    if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return null
    for (; d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      days.push(d)
      if (days.length > MAX_DAYS) return null
    }
  }
  return days
}

// Whether a day falls into one of the Time Frame's own dates. A date without a
// year ("14.6.") matches that day in any year.
function inFrame(day, frames) {
  const key = (m, d) => m * 100 + d
  const k = key(day.getMonth() + 1, day.getDate())
  return frames.some(({ start, end }) => {
    if (start.y && end.y) {
      const a = new Date(start.y, start.m - 1, start.d)
      const b = new Date(end.y, end.m - 1, end.d)
      return day >= a && day <= b
    }
    const a = key(start.m, start.d)
    const b = key(end.m, end.d)
    return a <= b ? k >= a && k <= b : k >= a || k <= b
  })
}

// Days written the way the Dates column writes them: runs of consecutive days
// as "12. - 14.6.27", single days as "18.6.27", joined with ", " and " & ".
export function formatDays(days) {
  const runs = []
  for (const d of days) {
    const run = runs[runs.length - 1]
    const prev = run?.[run.length - 1]
    if (prev && d - prev <= 86400000 * 1.5 && d.getDate() !== prev.getDate()) run.push(d)
    else runs.push([d])
  }
  const yy = d => String(d.getFullYear()).slice(-2)
  const full = d => `${d.getDate()}.${d.getMonth() + 1}.${yy(d)}`
  const parts = runs.map(run => {
    const a = run[0]
    const b = run[run.length - 1]
    if (run.length === 1) return full(a)
    if (a.getFullYear() !== b.getFullYear()) return `${full(a)} - ${full(b)}`
    if (a.getMonth() !== b.getMonth()) return `${a.getDate()}.${a.getMonth() + 1}. - ${full(b)}`
    return `${a.getDate()}. - ${full(b)}`
  })
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}` : parts[0] || ''
}

// → { text, narrowed } — narrowed says whether the Time Frame changed anything.
export function datesForVenue(datesText, timeFrame) {
  const original = String(datesText || '').trim()
  const same = { text: original, narrowed: false }
  if (!original || !String(timeFrame || '').trim()) return same
  const { include, exclude } = weekdaysIn(timeFrame)
  const frames = dateRangesIn(timeFrame)
  if (!include.size && !exclude.size && !frames.length) return same
  const days = daysOf(original)
  if (!days) return same
  const kept = days.filter(d => (!frames.length || inFrame(d, frames))
    && (!include.size || include.has(d.getDay()))
    && !exclude.has(d.getDay()))
  if (!kept.length || kept.length === days.length) return same
  return { text: formatDays(kept), narrowed: true }
}
