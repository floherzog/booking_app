import { ACTION_STATUSES, STATUS_META, CHIP_HUES, getMissingFields, isOnlineForm } from './constants.js'
import { replyHealth } from './replyStatus.js'

// What the filter bar, the chips and the Filter / Chips panel together decide:
// one plain object, so a custom chip can store a whole filter set and the
// table, the chip counts and the "is this chip on?" check all read it the same.

export const EMPTY_FILTERS = {
  band: '', country: '', type: '', status: '',
  actionOnly: false, nextBatch: false, missingInfo: false, onlineForm: false, duplicate: false, autoSend: false,
  search: '', advanced: [], sort: null,
}

// The square chips: lists that cut across the statuses. One is on at a time.
export const SHORTCUTS = [
  { key: 'actionOnly', label: 'Action needed' },
  { key: 'nextBatch', label: 'Next batch' },
  { key: 'missingInfo', label: 'Incomplete details' },
  { key: 'onlineForm', label: 'Online form' },
  { key: 'duplicate', label: 'Duplicates' },
  { key: 'autoSend', label: 'Auto-send' },
]
const SHORTCUT_OFF = Object.fromEntries(SHORTCUTS.map(s => [s.key, false]))

export const SEARCH_FIELDS = ['Venue', 'City', 'Country', 'Contact', 'Band', 'Email', 'Note', 'Status', 'Text', 'Time Frame', 'Dates']

// Column filters on the free-text columns take keywords: "formular, web form"
// matches a Note with either. Elsewhere the value is one phrase, so a picked
// value like "Müller, Anna" is not split.
export const KEYWORD_FIELDS = new Set(['Note', 'Text', 'Status'])
export function ruleTerms(rule) {
  const v = String(rule?.value || '').toLowerCase()
  const terms = KEYWORD_FIELDS.has(rule?.field) ? v.split(',') : [v]
  return terms.map(t => t.trim()).filter(Boolean)
}
// A column filter: `op` 'none' keeps the rows that contain none of the terms;
// anything else (and old rules without `op`) keeps the rows with one of them.
function matchesRule(r, rule) {
  if (rule.field === '_status') return r._status === rule.value
  if (rule.field === '_health') return replyHealth(r) === rule.value
  const cell = String(r[rule.field] || '').toLowerCase()
  const hit = ruleTerms(rule).some(t => cell.includes(t))
  return rule.op === 'none' ? !hit : hit
}

// The filters with one status pill or shortcut chip switched; the others go
// off, since each of them answers "which venues?" on its own.
export function toggleShortcut(filters, key) {
  return { ...filters, ...SHORTCUT_OFF, status: '', [key]: !filters[key] }
}
export function selectStatus(filters, status) {
  return { ...filters, ...SHORTCUT_OFF, status }
}

// ctx.isDuplicate(row): whether the row's venue is in a duplicate pair.
// ctx.classify: the classify context, so "Incomplete details" also counts a
// band without Dates or a template (see sendBlockers in constants.js).
export function matchesFilters(r, filters, ctx = {}) {
  const f = { ...EMPTY_FILTERS, ...filters }
  const q = (f.search || '').toLowerCase().trim()
  if (f.nextBatch && !(r._nextBatch || r['Draft'] === 'TRUE')) return false
  if (f.autoSend && r['Auto'] !== 'TRUE') return false
  if (f.missingInfo && getMissingFields(r, ctx.classify).length === 0) return false
  if (f.onlineForm && !isOnlineForm(r)) return false
  if (f.duplicate && !ctx.isDuplicate?.(r)) return false
  if (f.actionOnly && !ACTION_STATUSES.has(r._status)) return false
  if (f.status && r._status !== f.status) return false
  if (f.band && r['Band'] !== f.band) return false
  if (f.country && r['Country'] !== f.country) return false
  if (f.type && r['Type'] !== f.type) return false
  if (q && !SEARCH_FIELDS.some(k => (r[k] || '').toLowerCase().includes(q))) return false
  for (const rule of f.advanced || []) {
    if (!rule.field || !ruleTerms(rule).length) continue
    if (!matchesRule(r, rule)) return false
  }
  return true
}

// Only what changes the result: empty column filters, an unset sort and
// whitespace around the search do not.
function canonical(filters) {
  const f = { ...EMPTY_FILTERS, ...filters }
  return JSON.stringify([
    f.band, f.country, f.type, f.status,
    ...SHORTCUTS.map(s => !!f[s.key]),
    (f.search || '').trim(),
    (f.advanced || []).filter(r => r.field && ruleTerms(r).length).map(r => [r.field, r.op === 'none' ? 'none' : 'any', ruleTerms(r)]),
    f.sort?.field ? [f.sort.field, f.sort.dir || 'asc'] : null,
  ])
}
export function filtersEqual(a, b) {
  return canonical(a) === canonical(b)
}
export function isEmptyFilters(f) {
  return filtersEqual(f, EMPTY_FILTERS)
}

// What a filter set keeps, as a chip's tooltip. columnLabel maps a field key
// to its label in the Filter / Chips panel.
export function describeFilters(filters, columnLabel = k => k) {
  const f = { ...EMPTY_FILTERS, ...filters }
  const parts = []
  if (f.status) parts.push(`Status: ${STATUS_META[f.status]?.label || f.status}`)
  for (const s of SHORTCUTS) if (f[s.key]) parts.push(s.label)
  if (f.band) parts.push(`Band: ${f.band}`)
  if (f.country) parts.push(`Country: ${f.country}`)
  if (f.type) parts.push(`Type: ${f.type}`)
  if ((f.search || '').trim()) parts.push(`Search: “${f.search.trim()}”`)
  for (const r of f.advanced || []) {
    if (!r.field || !ruleTerms(r).length) continue
    const value = r.field === '_status' ? (STATUS_META[r.value]?.label || r.value)
      : r.field === '_health' ? r.value
      : ruleTerms(r).map(t => `“${t}”`).join(r.op === 'none' ? ' or ' : ' / ')
    parts.push(`${columnLabel(r.field)}: ${r.op === 'none' ? 'not ' : ''}${value}`)
  }
  if (f.sort?.field) parts.push(`sorted by ${columnLabel(f.sort.field)} ${f.sort.dir === 'desc' ? '↓' : '↑'}`)
  return parts.join(' · ') || 'No filters'
}

// Settings ▸ which chips the bar shows. `hidden` holds status keys (SEND, …)
// and shortcut keys (actionOnly, …); `custom` the saved filter sets.
// `colors` gives statuses and shortcut chips a colour of their own (key → hue);
// a custom chip carries its `color`. Unknown hues are dropped: default colours.
export function normalizeFilterChips(stored) {
  const s = stored && typeof stored === 'object' ? stored : {}
  const hue = v => (CHIP_HUES.includes(v) ? v : undefined)
  const colors = {}
  if (s.colors && typeof s.colors === 'object') {
    for (const [k, v] of Object.entries(s.colors)) if (hue(v)) colors[k] = v
  }
  return {
    hidden: Array.isArray(s.hidden) ? s.hidden.filter(k => typeof k === 'string') : [],
    colors,
    custom: Array.isArray(s.custom)
      ? s.custom
          .filter(c => c && typeof c.name === 'string' && c.name.trim() && c.filters && typeof c.filters === 'object')
          .map(c => ({
            id: String(c.id || c.name), name: c.name.trim(), filters: { ...EMPTY_FILTERS, ...c.filters },
            ...(hue(c.color) ? { color: c.color } : {}),
          }))
      : [],
  }
}
