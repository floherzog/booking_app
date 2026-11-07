import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// userData/startup.log: one line per launch, how long Booking took to get its
// window up — for a Mac where the first launch after an update sits in the
// Dock for minutes. If Booking's own times are short, the wait happened before
// it was allowed to run (macOS's or a managed Mac's security checking the new
// build). It stays on this Mac; Help ▸ Show Startup Log shows it in Finder.
// Only times, versions and the chip — nothing from the venue list or mail.
//
// After an in-app update the old copy notes when it asked for the restart
// (markUpdateLaunch), so the new one can say how long that took in seconds.

const LOG = 'startup.log'
const MARKER = 'update-launch.json'
const KEEP = 100
const MARKER_MAX_AGE = 6 * 3600 * 1000 // older than this, it says nothing

export const startupLogPath = dir => join(dir, LOG)

export function markUpdateLaunch(dir, { from = '', to = '', now = Date.now() } = {}) {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, MARKER), JSON.stringify({ requestedAt: now, from, to }))
  } catch { /* only a diagnostic */ }
}

// `processStart` in ms since the epoch; `info` { version, arch, rosetta, os }.
export function createStartupLog({ dir, processStart, info = {}, now = () => Date.now() }) {
  const marks = new Map()
  let written = false

  function updateNote() {
    const path = join(dir, MARKER)
    if (!existsSync(path)) return ''
    let note = ''
    try {
      const m = JSON.parse(readFileSync(path, 'utf8'))
      const waited = processStart - m.requestedAt
      if (Number.isFinite(waited) && waited >= 0 && waited < MARKER_MAX_AGE) {
        note = ` · updated ${m.from || '?'} → ${m.to || '?'}: ${(waited / 1000).toFixed(1)} s from restart to Booking starting`
      }
    } catch { /* unreadable: just drop it */ }
    try { unlinkSync(path) } catch { /* fine */ }
    return note
  }

  return {
    mark(name) {
      if (!written && !marks.has(name)) marks.set(name, Math.max(0, Math.round(now() - processStart)))
    },
    has: name => marks.has(name),
    // → the line written, or null. Once per launch; never throws.
    write() {
      if (written) return null
      written = true
      try {
        const times = [...marks].map(([name, ms]) => `${name} ${ms} ms`).join(' · ')
        const line = [
          new Date(processStart).toISOString(),
          `Booking ${info.version || '?'}`,
          `${info.arch || '?'}${info.rosetta ? ' (Rosetta)' : ''}`,
          `macOS ${info.os || '?'}`,
          times || 'no times',
        ].join(' · ') + updateNote()
        mkdirSync(dir, { recursive: true })
        const path = join(dir, LOG)
        const old = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []
        writeFileSync(path, [...old, line].slice(-KEEP).join('\n') + '\n')
        return line
      } catch {
        return null
      }
    },
  }
}
