// Reloading the CSV (↻) keeps what hasn't been saved yet. Staged edits and
// deletions are keyed by line number (_idx), which a changed file can shift,
// so each line is found again by what it is — Venue, Band and City — taking
// same-named lines in order. Lines added in the app aren't in the file; they
// come back as they were, edits included.
//
// `pending`: { rows (as loaded before), edits, deletions, additions };
// `freshRows`: the lines just loaded.
// → { edits, deletions: Set, added: [plain rows], lost }. An edit the file
// now agrees with is dropped; `lost` counts lines with changes that are no
// longer in the file (renamed or deleted elsewhere).

const norm = v => String(v ?? '').trim().toLowerCase()
export const lineKey = r => [r?.['Venue'], r?.['Band'], r?.['City']].map(norm).join('|')
const plain = r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))

export function carryOver({ rows = [], edits = {}, deletions = new Set(), additions = new Set() }, freshRows = []) {
  const pool = new Map()
  for (const r of freshRows) {
    const k = lineKey(r)
    if (!pool.has(k)) pool.set(k, [])
    pool.get(k).push(r)
  }
  const out = { edits: {}, deletions: new Set(), added: [], lost: 0 }
  for (const old of rows) {
    const rowEdits = edits[old._idx] || {}
    if (additions.has(old._idx)) {
      if (!deletions.has(old._idx)) out.added.push(plain({ ...old, ...rowEdits }))
      continue
    }
    // Every line takes its counterpart, so same-named lines stay paired in order.
    const match = pool.get(lineKey(old))?.shift() || null
    const changed = Object.keys(rowEdits).length > 0
    const deleted = deletions.has(old._idx)
    if (!changed && !deleted) continue
    if (!match) { out.lost++; continue }
    if (deleted) out.deletions.add(match._idx)
    const kept = Object.fromEntries(Object.entries(rowEdits).filter(([f, v]) => String(v ?? '') !== String(match[f] ?? '')))
    if (Object.keys(kept).length) out.edits[match._idx] = kept
  }
  return out
}
