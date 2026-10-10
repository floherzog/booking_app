import { api } from '../platform'

// Thin async wrapper over the platform's settings store: main's settings.json in
// the Mac app, settings.php in the web app. Both normalise through
// core/settings.js, so whatever comes back here is already complete.
export function getSettings() {
  return api.getSettings()
}

// Writes the whole settings object and returns what was actually persisted
// (main re-applies its defaults/merges), so callers should use the return value.
export function saveSettings(next) {
  return api.setSettings(next)
}
