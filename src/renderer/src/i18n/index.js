import { useSyncExternalStore } from 'react'
import { formatText } from '@core/tr'
import de from './de'

// The language the app speaks: Automatic (German when the system or browser
// prefers German), English or Deutsch. Remembered per device, like the theme,
// and applied straight away.
//
// The English text is the key: t('Save') is 'Speichern' in German, and any text
// not in de.js stays English. Components call useT() so they redraw when the
// language changes; plain helpers can use t() directly.
const KEY = 'booking_language'
export const LANGUAGE_CHOICES = [
  { value: 'auto', label: 'Automatic' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
]
const listeners = new Set()

export function getLanguageSetting() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'en' || v === 'de' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function systemLanguage() {
  const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || []
  return String(langs[0] || '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function resolveLanguage(setting = getLanguageSetting()) {
  return setting === 'auto' ? systemLanguage() : setting
}

let current = resolveLanguage()

export function setLanguageSetting(value) {
  try { localStorage.setItem(KEY, value) } catch { /* storage unavailable */ }
  current = resolveLanguage(value)
  if (typeof document !== 'undefined') document.documentElement.lang = current
  listeners.forEach(l => l())
}

export function getLanguage() {
  return current
}

export function t(text, vars) {
  const s = current === 'de' ? (de[text] ?? text) : text
  return formatText(s, vars)
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage)
}

// t, for a component that should redraw when the language changes.
export function useT() {
  useLanguage()
  return t
}
