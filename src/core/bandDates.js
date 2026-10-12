// Venues whose Dates column is out of step with their band's touring dates
// (Settings ▸ Bands): empty, or holding something else. A band without touring
// dates has nothing to compare against, so its venues never show up here.

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

// rows: the effective rows (edits applied, deletions left out).
// → { missing, mismatch }, each [{ idx, venue, band, have, want }].
export function bandDateGaps(rows, bands) {
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
    else if (norm(have) !== norm(want)) mismatch.push(gap)
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
