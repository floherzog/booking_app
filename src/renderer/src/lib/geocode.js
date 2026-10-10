import { api } from '../platform'

// Geocoding belongs to the platform. In the Mac app it runs in the main process:
// Nominatim's usage policy wants a descriptive User-Agent, and `User-Agent` is a
// forbidden header for the renderer's fetch; main also owns the cache file, the
// 1-req/sec throttle and the bundled seed data. The web app does the same in
// platform/web.js with the deployed snapshot. This module is just the bridge.

// → { lat, lng } | null. Cached results (including "not found") return instantly.
export async function geocodeCity(city, country) {
  try {
    return await api.geocode(city, country)
  } catch {
    return null
  }
}

// The whole persisted cache ({ "City||Country": { lat, lng } | null }), seeded
// from the app's bundled snapshot on first run.
export async function loadSeedCache() {
  try {
    return await api.geoCacheSnapshot()
  } catch {
    return {}
  }
}
