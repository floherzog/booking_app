import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { normalizeSettings } from '../core/settings.js'
import { stampChanges } from '../core/settingsSync.js'

// Plain JSON in userData. The shape and its defaults live in src/core/settings.js,
// shared with the web build; this file only reads and writes it.
export { DEFAULT_SETTINGS } from '../core/settings.js'

function settingsPath() {
  return join(app.getPath('userData'), 'settings.json')
}

const withDefaults = normalizeSettings

export function readSettings() {
  try {
    return withDefaults(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    // Missing or corrupt file → defaults. Never throw here: the app must boot.
    return withDefaults(null)
  }
}

// Atomic write: a temp file in the SAME directory, then rename. Same-dir matters
// on iCloud Drive and across volumes, where rename() across directories can fail.
// Every write stamps the synced sections it changes (src/core/settingsSync.js),
// so a sync with the web app knows which side changed what last.
export function writeSettings(next, { stamp = true } = {}) {
  const target = settingsPath()
  const normalized = withDefaults(next)
  const merged = stamp ? stampChanges(readSettings(), normalized) : normalized
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
    renameSync(tmp, target)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
  return merged
}

// Merge a partial update over what is on disk (top-level sections replaced whole).
export function patchSettings(patch) {
  return writeSettings({ ...readSettings(), ...(patch || {}) })
}
