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
