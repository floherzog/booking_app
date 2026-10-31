import { useSyncExternalStore } from 'react'
import { STATUS_META, CHIP_HUES } from '@core/constants'

// The colours a chip — and the status behind it — can be given (Filter / Chips
// ▸ Chips / saved filters). Each hue spells out its classes in full: Tailwind
// only generates classes it can find written down, so they can't be pieced
// together at runtime.
export const PALETTE = {
  gray: {
    hex: '#6B7280',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    row: 'border-l-4 border-gray-400',
    dot: 'bg-gray-500',
    on: 'bg-gray-600 text-white border-gray-600 dark:bg-gray-500 dark:border-gray-500',
    off: 'bg-transparent text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-900/20',
  },
  red: {
    hex: '#EF4444',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    row: 'border-l-4 border-red-400',
    dot: 'bg-red-500',
    on: 'bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500',
    off: 'bg-transparent text-red-700 border-red-300 hover:border-red-400 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:border-red-600 dark:hover:bg-red-900/20',
  },
  orange: {
    hex: '#F97316',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    row: 'border-l-4 border-orange-400',
    dot: 'bg-orange-500',
    on: 'bg-orange-600 text-white border-orange-600 dark:bg-orange-500 dark:border-orange-500',
    off: 'bg-transparent text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:border-orange-600 dark:hover:bg-orange-900/20',
  },
  amber: {
    hex: '#F59E0B',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    row: 'border-l-4 border-amber-400',
    dot: 'bg-amber-500',
    on: 'bg-amber-600 text-white border-amber-600 dark:bg-amber-500 dark:border-amber-500',
    off: 'bg-transparent text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:border-amber-600 dark:hover:bg-amber-900/20',
  },
  yellow: {
    hex: '#EAB308',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    row: 'border-l-4 border-yellow-400',
    dot: 'bg-yellow-500',
    on: 'bg-yellow-600 text-gray-900 border-yellow-600 dark:bg-yellow-500 dark:border-yellow-500',
    off: 'bg-transparent text-yellow-700 border-yellow-300 hover:border-yellow-400 hover:bg-yellow-50 dark:text-yellow-400 dark:border-yellow-800 dark:hover:border-yellow-600 dark:hover:bg-yellow-900/20',
  },
  lime: {
    hex: '#84CC16',
    badge: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
    row: 'border-l-4 border-lime-400',
    dot: 'bg-lime-500',
    on: 'bg-lime-600 text-gray-900 border-lime-600 dark:bg-lime-500 dark:border-lime-500',
    off: 'bg-transparent text-lime-700 border-lime-300 hover:border-lime-400 hover:bg-lime-50 dark:text-lime-400 dark:border-lime-800 dark:hover:border-lime-600 dark:hover:bg-lime-900/20',
  },
  green: {
    hex: '#22C55E',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    row: 'border-l-4 border-green-400',
    dot: 'bg-green-500',
    on: 'bg-green-600 text-white border-green-600 dark:bg-green-500 dark:border-green-500',
    off: 'bg-transparent text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:border-green-600 dark:hover:bg-green-900/20',
  },
  teal: {
    hex: '#14B8A6',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    row: 'border-l-4 border-teal-400',
    dot: 'bg-teal-500',
    on: 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500',
    off: 'bg-transparent text-teal-700 border-teal-300 hover:border-teal-400 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:hover:border-teal-600 dark:hover:bg-teal-900/20',
  },
  cyan: {
    hex: '#06B6D4',
    badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    row: 'border-l-4 border-cyan-400',
    dot: 'bg-cyan-500',
    on: 'bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500 dark:border-cyan-500',
    off: 'bg-transparent text-cyan-700 border-cyan-300 hover:border-cyan-400 hover:bg-cyan-50 dark:text-cyan-400 dark:border-cyan-800 dark:hover:border-cyan-600 dark:hover:bg-cyan-900/20',
  },
  sky: {
    hex: '#0EA5E9',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    row: 'border-l-4 border-sky-400',
    dot: 'bg-sky-500',
    on: 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500',
    off: 'bg-transparent text-sky-700 border-sky-300 hover:border-sky-400 hover:bg-sky-50 dark:text-sky-400 dark:border-sky-800 dark:hover:border-sky-600 dark:hover:bg-sky-900/20',
  },
  blue: {
    hex: '#3B82F6',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    row: 'border-l-4 border-blue-400',
    dot: 'bg-blue-500',
    on: 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500',
    off: 'bg-transparent text-blue-700 border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20',
  },
  indigo: {
    hex: '#6366F1',
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    row: 'border-l-4 border-indigo-400',
    dot: 'bg-indigo-500',
    on: 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500',
    off: 'bg-transparent text-indigo-700 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20',
  },
  violet: {
    hex: '#8B5CF6',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    row: 'border-l-4 border-violet-400',
    dot: 'bg-violet-500',
    on: 'bg-violet-600 text-white border-violet-600 dark:bg-violet-500 dark:border-violet-500',
    off: 'bg-transparent text-violet-700 border-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:border-violet-600 dark:hover:bg-violet-900/20',
  },
  pink: {
    hex: '#EC4899',
    badge: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    row: 'border-l-4 border-pink-400',
    dot: 'bg-pink-500',
    on: 'bg-pink-600 text-white border-pink-600 dark:bg-pink-500 dark:border-pink-500',
    off: 'bg-transparent text-pink-700 border-pink-300 hover:border-pink-400 hover:bg-pink-50 dark:text-pink-400 dark:border-pink-800 dark:hover:border-pink-600 dark:hover:bg-pink-900/20',
  },
  rose: {
    hex: '#F43F5E',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    row: 'border-l-4 border-rose-400',
    dot: 'bg-rose-500',
    on: 'bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500',
    off: 'bg-transparent text-rose-700 border-rose-300 hover:border-rose-400 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:border-rose-600 dark:hover:bg-rose-900/20',
  },
}

// The chosen colours, from settings.filterChips (colors: key → hue for statuses
// and shortcut chips; custom chips carry their own `color`). Kept here rather
// than passed down, so the map's marker drawing can read them too; components
// call useChipColors() to redraw when they change.
let chips = { colors: {}, custom: [] }
const listeners = new Set()
export function setChipColors(filterChips) {
  const next = { colors: filterChips?.colors || {}, custom: filterChips?.custom || [] }
  if (JSON.stringify(next.colors) === JSON.stringify(chips.colors)) { chips = next; return }
  chips = next
  listeners.forEach(l => l())
}
function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useChipColors() {
  return useSyncExternalStore(subscribe, () => chips.colors)
}

const hueOf = key => (CHIP_HUES.includes(chips.colors[key]) ? chips.colors[key] : null)

// A status's badge, row marking and map colour, with any colour chosen for it.
// A status whose row has a coloured left border keeps one, in its new colour;
// the faded ones stay faded.
export function statusMeta(status) {
  const meta = STATUS_META[status]
  const hue = hueOf(status)
  if (!meta || !hue) return meta || {}
  const p = PALETTE[hue]
  return { ...meta, badge: p.badge, row: meta.row?.includes('border-l-4') ? p.row : meta.row, mapColor: p.hex }
}

// A square chip's on/off look: the chosen hue, or `fallback` (its own default).
export function chipStyle(key, fallback) {
  const hue = hueOf(key)
  return hue ? PALETTE[hue] : fallback
}
export function customChipStyle(color, fallback) {
  return CHIP_HUES.includes(color) ? PALETTE[color] : fallback
}
