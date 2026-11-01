import { useSyncExternalStore } from 'react'
import { setDateOrder, getDateOrder } from '@core/parseDate'

// Day first (31.12.26) or month first (12/31/26) — Settings ▸ General. Kept
// per device like the language and the theme; only how dates look and how a
// typed slash date is read. The CSV always stores dd.MM.yy (core/parseDate.js).
const KEY = 'booking_dateOrder'
const listeners = new Set()

function stored() {
  try { return localStorage.getItem(KEY) === 'mdy' ? 'mdy' : 'dmy' } catch { return 'dmy' }
}
setDateOrder(stored())

export function setDateOrderSetting(order) {
  try { localStorage.setItem(KEY, order) } catch { /* storage unavailable */ }
  setDateOrder(order)
  listeners.forEach(l => l())
}
function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}
// Components that show dates call this so they redraw when it changes.
export function useDateOrder() {
  return useSyncExternalStore(subscribe, getDateOrder)
}
