import { useSyncExternalStore } from 'react'

// Per-device display choices, kept like the theme in localStorage rather than
// in settings.json: a phone and a laptop may well want them different.
const PIN_KEY = 'booking_pinToolbar'
const listeners = new Set()

// Keep the toolbar (search, Select, Filter / Chips…) and the column headings
// at the top while the list scrolls. On unless turned off.
export function getPinToolbar() {
  try { return localStorage.getItem(PIN_KEY) !== 'off' } catch { return true }
}
export function setPinToolbar(on) {
  try { localStorage.setItem(PIN_KEY, on ? 'on' : 'off') } catch { /* storage unavailable */ }
  listeners.forEach(l => l())
}
function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function usePinToolbar() {
  return useSyncExternalStore(subscribe, getPinToolbar)
}

// What the bar at the top holds once the toolbar has scrolled away. The
// defaults are the toolbar itself, Save, and the column headings.
export const PIN_ITEMS = [
  { key: 'chips', label: 'Chips', on: false },
  { key: 'search', label: 'Search', on: true },
  { key: 'select', label: 'Select', on: true },
  { key: 'email', label: 'Email', on: true, needs: 'mail' },
  { key: 'filter', label: 'Filter / Chips', on: true },
  { key: 'newVenue', label: '+ New Venue', on: true },
  { key: 'save', label: 'Save (with unsaved changes)', on: true },
  { key: 'dropdowns', label: 'Band / Country / Type', on: false },
  { key: 'headings', label: 'Column headings', on: true },
]
const ITEMS_KEY = 'booking_pinItems'
const DEFAULT_ITEMS = Object.fromEntries(PIN_ITEMS.map(i => [i.key, i.on]))
let itemsRaw
let itemsCache = DEFAULT_ITEMS
export function getPinItems() {
  let raw = null
  try { raw = localStorage.getItem(ITEMS_KEY) } catch { /* storage unavailable */ }
  if (raw !== itemsRaw) {
    itemsRaw = raw
    let stored = {}
    try { stored = JSON.parse(raw) || {} } catch { /* broken: defaults */ }
    itemsCache = Object.fromEntries(PIN_ITEMS.map(i => [i.key, typeof stored[i.key] === 'boolean' ? stored[i.key] : i.on]))
  }
  return itemsCache
}
export function setPinItem(key, on) {
  try { localStorage.setItem(ITEMS_KEY, JSON.stringify({ ...getPinItems(), [key]: on })) } catch { /* storage unavailable */ }
  listeners.forEach(l => l())
}
export function usePinItems() {
  return useSyncExternalStore(subscribe, getPinItems)
}
