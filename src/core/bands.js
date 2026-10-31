// A managed band is `{ name, tourDates, mailAccountId }`. `tourDates` is free
// text (a date range or anything else) — the band's Dates. Older configs stored
// bands as bare strings, or as `{ tourStart, tourEnd }` — helpers tolerate all
// shapes. The old `bookFiller` flag now lives in the filler type's rule
// (settings.venueTypeRules), which normalizeSettings migrates it into.
// `mailAccountId` is empty for a band that sends from the default account, which
// is every band until a second mail account exists.
export function bandName(b) {
  return typeof b === 'string' ? b : (b?.name || '')
}

// Migrate/normalize a stored band list (strings and/or objects) to full objects.
export function normalizeBands(bands) {
  return (bands || []).map(b => {
    if (typeof b === 'string') return { name: b, tourDates: '', mailAccountId: '' }
    // Migrate the earlier { tourStart, tourEnd } shape into free-text tourDates.
    let tourDates = b?.tourDates || ''
    if (!tourDates && (b?.tourStart || b?.tourEnd)) {
      tourDates = [b.tourStart, b.tourEnd].filter(Boolean).join(' – ')
    }
    return {
      name: b?.name || '',
      tourDates,
      mailAccountId: String(b?.mailAccountId || ''),
    }
  })
}

// The band options offered in dropdowns: the union of the user's managed band
// names and any band values already present in the CSV rows, sorted. Using the
// union guarantees no existing venue's band ever disappears from a dropdown,
// even if that band isn't in the managed list yet.
export function effectiveBandOptions(rows, managed = []) {
  const set = new Set((managed || []).map(bandName).filter(Boolean))
  for (const r of rows) {
    const b = r['Band']
    if (b) set.add(b)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

// Lower-cased names of the bands that have Dates set — what classifyBooking
// checks a venue without Dates of its own against.
export function bandsWithDatesSet(bands) {
  return new Set(normalizeBands(bands).filter(b => b.name && b.tourDates.trim()).map(b => b.name.trim().toLowerCase()))
}

// Distinct band values present in the rows (used to seed the managed list on
// first run). Sorted, empties dropped.
export function bandsFromRows(rows) {
  return [...new Set(rows.map(r => r['Band']).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}
