import { useEffect, useState } from 'react'
import { api } from '../platform'

// Renderer-side mirror of the main process's venue-gender cache.
//
// {{article}} has to be resolved inside prepareDraft, which is synchronous and
// called from render paths (previews, preflight lists, disabled-button reasons).
// Looking the gender up over IPC there is impossible, and threading a map through
// every component that can draft would touch six of them. Since main already
// keeps this as a permanent cache, a module-level registry here is an honest
// mirror of it rather than hidden state.

let registry = {}

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
