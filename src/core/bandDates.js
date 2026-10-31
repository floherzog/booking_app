import { parseDate } from './parseDate.js'

// Venues whose Dates column is out of step with their band's Dates
// (Settings ▸ Bands): empty, or holding something else. A band without Dates
// has nothing to compare against, so its venues never show up here.

// Spacing, dash style and case are not a difference: "12.-20.6.27" and
// "12. – 20.6.27" are the same dates.
function norm(s) {
  return String(s || '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// What "Keep" in the notice remembers: this venue keeps these dates for as long
// as the band's Dates stay what they are.
export function keepKey({ venue, band, have, want }) {
  return [venue, band, norm(have), norm(want)].join('\u0001')
}

// rows: the effective rows (edits applied, deletions left out).
// kept: keepKey()s of mismatches the user chose to keep.
// → { missing, mismatch }, each [{ idx, venue, band, have, want }].
export function bandDateGaps(rows, bands, kept = []) {
  const keep = new Set(kept)
  const tour = new Map()
  for (const b of bands || []) {
    const want = (b?.tourDates || '').trim()
    if (b?.name && want) tour.set(b.name, want)
  }
  const missing = []
  const mismatch = []
  for (const r of rows) {
    const want = tour.get(r['Band'])
    if (!want) continue
    const have = (r['Dates'] || '').trim()
    const gap = { idx: r._idx, venue: r['Venue'] || '', band: r['Band'], have, want }
    if (!have) missing.push(gap)
    else if (norm(have) !== norm(want) && !keep.has(keepKey(gap))) mismatch.push(gap)
  }
  return { missing, mismatch }
}

// A short fingerprint of a set of gaps, so a dismissed notice stays away until
// the gaps themselves change. Row indexes shift after a save; names do not.
export function gapsKey({ missing, mismatch }) {
  const text = [...missing, ...mismatch]
    .map(g => `${g.venue}\u0001${g.band}\u0001${g.have}\u0001${g.want}`)
    .sort()
    .join('\u0002')
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${missing.length + mismatch.length}:${(h >>> 0).toString(36)}`
}

// The latest date a Dates text names, if any: "12. - 20.9.26" → 20.9.26,
// "Mai 2026" → May 2026. Used only to tell dates already over apart.
function lastDateIn(text) {
  const full = String(text).match(/\d{1,2}\.\d{1,2}\.\d{2,4}/g) || []
  const dates = full.map(parseDate).filter(Boolean)
  if (!dates.length) {
    const year = String(text).match(/\b(20\d\d)\b/g)
    if (year) dates.push(new Date(Math.max(...year.map(Number)), 11, 31))
  }
  return dates.length ? new Date(Math.max(...dates)) : null
}

// What a band's venues already carry in their Dates column, for the band's own
// Dates field to suggest: one entry per distinct value (spelling variants
// merged, the most used spelling shown), most used first, dates already over
// last. → [{ text, count, past }]
export function datesSuggestions(rows, band, today = new Date()) {
  const groups = new Map()
  for (const r of rows || []) {
    if (r?.['Band'] !== band) continue
    const text = (r['Dates'] || '').trim()
    if (!text) continue
    const key = norm(text)
    const g = groups.get(key) || { spellings: new Map(), count: 0 }
    g.count += 1
    g.spellings.set(text, (g.spellings.get(text) || 0) + 1)
    groups.set(key, g)
  }
  return [...groups.values()]
    .map(g => {
      const text = [...g.spellings].sort((a, b) => b[1] - a[1])[0][0]
      const last = lastDateIn(text)
      return { text, count: g.count, past: !!last && last < today }
    })
    .sort((a, b) => (a.past - b.past) || (b.count - a.count) || a.text.localeCompare(b.text))
}

// The band's Dates to fill in on its own: only when every venue agrees.
export function agreedDates(rows, band) {
  const all = datesSuggestions(rows, band, new Date(0))
  return all.length === 1 ? all[0].text : ''
}
