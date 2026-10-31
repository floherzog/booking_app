import { useEffect, useState } from 'react'
import { api } from '../platform'
import { firstNameOf } from '@core/templates'

// Renderer-side mirror of the main process's venue-gender cache.
//
// {{article}} has to be resolved inside prepareDraft, which is synchronous and
// called from render paths (previews, preflight lists, disabled-button reasons).
// Looking the gender up over IPC there is impossible, and threading a map through
// every component that can draft would touch six of them. Since main already
// keeps this as a permanent cache, a module-level registry here is an honest
// mirror of it rather than hidden state.

let registry = {}
// The same for contacts' first names ('f' | 'm' | 'x'), for {{greeting}}.
let names = {}

export function genderOf(venue) {
  const key = String(venue || '').trim()
  return (key && registry[key]) || null
}

export function knownGenders() {
  return registry
}

// Resolve and remember the genders for these venue names. Names already known to
// the main process come back from its cache without touching the model.
export async function ensureGenders(venues = []) {
  const names = [...new Set(venues.map(v => String(v || '').trim()).filter(Boolean))]
  const unknown = names.filter(n => !(n in registry))
  if (unknown.length === 0) return { ok: true, status: 'available', added: 0 }
  try {
    const result = await api.resolveGenders(unknown)
    if (result?.genders) registry = { ...registry, ...result.genders }
    return {
      ok: !!result?.ok,
      status: result?.status || 'failed',
      error: result?.error || null,
      added: Object.keys(result?.genders || {}).length,
    }
  } catch (e) {
    return { ok: false, status: 'failed', error: e.message, added: 0 }
  }
}

export async function overrideGender(venue, gender) {
  const key = String(venue || '').trim()
  const result = await api.setGenderOverride(key, gender)
  if (result?.ok) {
    if (gender) registry = { ...registry, [key]: gender }
    else { const next = { ...registry }; delete next[key]; registry = next }
  }
  return result
}

// Resolve genders for exactly the venues being drafted, and re-render when they
// land.
//
// Deliberately NOT run across the whole table on load: a list of three thousand
// venues would mean thousands of model calls before anyone asked for anything —
// the same mistake the map's geocoder used to make. Callers pass the venues in
// the operation at hand (one row, or one bulk batch), which is bounded and small.
export function useGenders(venues, enabled = true) {
  const [version, setVersion] = useState(0)
  const key = enabled ? venues.filter(Boolean).join('|') : ''

  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    ensureGenders(key.split('|')).then(r => {
      if (!cancelled && r?.added) setVersion(v => v + 1)
    })
    return () => { cancelled = true }
  }, [key, enabled])

  return version
}

// --- first names, for "Liebe / Lieber" ---------------------------------------

export function contactGenderOf(contact) {
  const first = firstNameOf(contact)
  return (first && names[first]) || null
}

export async function ensureContactGenders(contacts = []) {
  const wanted = [...new Set(contacts.map(firstNameOf).filter(Boolean))]
  const unknown = wanted.filter(n => !(n in names))
  if (unknown.length === 0) return { ok: true, added: 0 }
  try {
    const result = await api.resolveGenders(unknown, 'firstname')
    if (result?.genders) names = { ...names, ...result.genders }
    return { ok: !!result?.ok, added: Object.keys(result?.genders || {}).length }
  } catch (e) {
    return { ok: false, error: e.message, added: 0 }
  }
}

// gender '' clears the correction and lets the model answer again.
export async function overrideContactGender(contact, gender) {
  const first = firstNameOf(contact)
  if (!first) return { ok: false }
  const result = await api.setGenderOverride(first, gender, 'firstname')
  if (result?.ok) {
    if (gender) names = { ...names, [first]: gender }
    else { const next = { ...names }; delete next[first]; names = next }
  }
  return result
}

// useGenders for contacts: resolve the first names of exactly these contacts.
export function useContactGenders(contacts, enabled = true) {
  const [version, setVersion] = useState(0)
  const key = enabled ? contacts.filter(Boolean).join('|') : ''

  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    ensureContactGenders(key.split('|')).then(r => {
      if (!cancelled && r?.added) setVersion(v => v + 1)
    })
    return () => { cancelled = true }
  }, [key, enabled])

  return version
}
