import { normalizeBands } from './bands.js'
import { normalizeVenueTypes } from './venueTypes.js'

// Bands, venue types and countries the CSV uses but Settings doesn't know
// (banners in App, chips in Settings), and the reverse — bands and types in
// Settings that no venue uses (a note in Settings only). Names compare without
// case or surrounding spaces; suggestions keep the CSV's spelling, most-used
// first. A country "is known" once Settings ▸ Languages maps it to a language.

const key = s => String(s || '').trim().toLowerCase()

function tally(rows, field) {
  const found = new Map() // key → { name, count }
  for (const r of rows) {
    const values = r._entries?.length ? r._entries.map(e => e[field] ?? r[field]) : [r[field]]
    for (const v of values) {
      const name = String(v || '').trim()
      if (!name) continue
      const k = key(name)
      const hit = found.get(k)
      if (hit) hit.count++
      else found.set(k, { name, count: 1 })
    }
  }
  return found
}

const missing = (found, known, dismissed = []) => {
  const skip = new Set([...known, ...dismissed].map(key))
  return [...found.entries()].filter(([k]) => !skip.has(k)).map(([, v]) => v)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// → { bands, venueTypes, countries: [{ name, count }], unusedBands, unusedTypes: [name] }
// `dismissed` ({ bands, venueTypes, countries }) leaves out what a banner's ×
// already hid; Settings passes none, so its chips show everything.
export function csvSuggestions(rows, settings, { dismissed = {} } = {}) {
  const live = (rows || []).filter(r => !r._deleted)
  const bandNames = normalizeBands(settings?.bands).map(b => b.name).filter(Boolean)
  const typeNames = normalizeVenueTypes(settings?.venueTypes)
  const countryNames = Object.keys(settings?.languages?.map || {})
  const bands = tally(live, 'Band')
  const types = tally(live, 'Type')
  return {
    bands: missing(bands, bandNames, dismissed.bands),
    venueTypes: missing(types, typeNames, dismissed.venueTypes),
    countries: missing(tally(live, 'Country'), countryNames, dismissed.countries),
    unusedBands: bandNames.filter(n => !bands.has(key(n))),
    unusedTypes: typeNames.filter(n => !types.has(key(n))),
  }
}
