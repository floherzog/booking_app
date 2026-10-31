import { plainT } from './tr.js'
// A venue's `Type` is a free CSV column. What a type does is decided by its rule
// (Settings ▸ Venue types, and the type gates in Rules ▸ Flow):
//   behaves  'never'    → never contacted (Dead)
//            'festival' → only while the festival booking window is open
//            'normal'   → the ordinary case
//   bands    null = every band books it; a list = only those bands do, every
//            other band's entry is kept out of outreach ("Not for this band")
//   frequencyDays  the re-contact window for the type, unless the venue's own
//            Frequency says otherwise; null = the rules' default
// The dropdown exists to stop typos from silently turning a "dead" venue back
// into an active one.
export const DEFAULT_VENUE_TYPES = ['main', 'festival', 'filler', 'dead']

export const TYPE_BEHAVIOURS = [
  { id: 'normal', label: 'Normal' },
  { id: 'festival', label: 'Festival window' },
  { id: 'never', label: 'Never contact' },
]

const PLAIN_RULE = { behaves: 'normal', bands: null, frequencyDays: null }

// What the built-in types did before rules existed, and still do by default.
// Filler venues start with no band booking them.
export const DEFAULT_TYPE_RULES = {
  dead: { ...PLAIN_RULE, behaves: 'never' },
  festival: { ...PLAIN_RULE, behaves: 'festival' },
  filler: { ...PLAIN_RULE, bands: [] },
}

const typeKey = t => String(t || '').trim().toLowerCase()

function normalizeTypeRule(r) {
  const behaves = TYPE_BEHAVIOURS.some(b => b.id === r?.behaves) ? r.behaves : 'normal'
  const bands = Array.isArray(r?.bands)
    ? [...new Set(r.bands.map(b => String(b || '').trim()).filter(Boolean))]
    : null
  const days = Number(r?.frequencyDays)
  return { behaves, bands, frequencyDays: Number.isFinite(days) && days > 0 ? Math.round(days) : null }
}

// Stored rules, keyed by lower-cased type. Plain rules are dropped, so the
// stored object only says what differs from an ordinary type. `stored`
// undefined means a settings file from before rules existed: start from the
// defaults, with the bands that had "Book filler venues" ticked booking fillers.
export function normalizeTypeRules(stored, legacyFillerBands = []) {
  const source = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : { ...DEFAULT_TYPE_RULES, filler: { ...DEFAULT_TYPE_RULES.filler, bands: legacyFillerBands } }
  const out = {}
  for (const [type, rule] of Object.entries(source)) {
    const key = typeKey(type)
    if (!key) continue
    const r = normalizeTypeRule(rule)
    if (!isPlainRule(r)) out[key] = r
  }
  return out
}

export function isPlainRule(r) {
  return !r || (r.behaves === 'normal' && r.bands === null && r.frequencyDays === null)
}

export function typeRuleFor(typeRules, type) {
  return typeRules?.[typeKey(type)] || PLAIN_RULE
}

// The rules with one type's rule changed (`patch` merged over the current one).
export function setTypeRule(typeRules, type, patch) {
  const key = typeKey(type)
  const next = { ...(typeRules || {}) }
  const r = normalizeTypeRule({ ...typeRuleFor(typeRules, type), ...patch })
  if (isPlainRule(r)) delete next[key]
  else next[key] = r
  return next
}

// The types a flow gate lists: those that behave a given way, or — for the
// band gate — those only some bands book.
export function typesWith(typeRules, test) {
  return Object.entries(typeRules || {}).filter(([, r]) => test(r)).map(([t]) => t)
}

// Whether the band books venues of this type.
export function bandBooksType(typeRules, type, band) {
  const { bands } = typeRuleFor(typeRules, type)
  if (bands === null) return true
  const b = typeKey(band)
  return bands.some(x => typeKey(x) === b)
}

// Types whose value changes how the app classifies a row, shown in Settings so
// the user knows which names are more than labels.
export function behavioralTypes(typeRules) {
  return typesWith(typeRules, r => !isPlainRule(r))
}

// Where a type is in use before it is deleted: its rule (in words, as the flow
// shows it) and how many venues carry it. Empty `rule` = an ordinary type.
export function typeUsage(typeRules, type, rows = [], t = plainT) {
  const r = typeRuleFor(typeRules, type)
  const parts = []
  const name = `“${type}”`
  if (r.behaves === 'never') parts.push(t('Type is {type} → Dead (never contacted)', { type: name }))
  if (r.behaves === 'festival') parts.push(t('Type is {type} and the festival booking window is closed', { type: name }))
  if (r.bands !== null) parts.push(t('Type is {type} and the band isn’t one that books it', { type: name }))
  if (r.frequencyDays) parts.push(t('its own follow-up interval ({days} days)', { days: r.frequencyDays }))
  const key = typeKey(type)
  const venues = rows.filter(row => typeKey(row?.['Type']) === key).length
  return { rule: parts, venues }
}

// Settings written before venue-type rules (version 1) may lack the built-in
// types entirely — a Mac set up before "filler" existed never got it. Version 2
// adds them back once; after that a deleted built-in type stays deleted.
export const VENUE_TYPES_VERSION = 2
export function migrateVenueTypes(types, version) {
  const list = normalizeVenueTypes(types)
  if ((version || 1) >= VENUE_TYPES_VERSION) return list
  const have = new Set(list.map(typeKey))
  return [...list, ...DEFAULT_VENUE_TYPES.filter(t => !have.has(t))]
}

export function normalizeVenueTypes(types) {
  const seen = new Set()
  const out = []
  for (const t of types || []) {
    const name = String(typeof t === 'string' ? t : (t?.name || '')).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

// The options offered in Type dropdowns: the union of the managed list and any
// value already present in the rows, so no existing venue's type can vanish.
// Mirrors effectiveBandOptions in bands.js.
export function effectiveTypeOptions(rows, managed = []) {
  const out = normalizeVenueTypes(managed)
  const seen = new Set(out.map(t => t.toLowerCase()))
  for (const r of rows || []) {
    const t = String(r?.['Type'] || '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.sort((a, b) => a.localeCompare(b))
}
