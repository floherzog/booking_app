import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStartupLog, markUpdateLaunch, startupLogPath } from '../startupLog.js'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'startup-log-')) })

const info = { version: '0.28.0', arch: 'arm64', rosetta: false, os: '26.6.2' }

describe('startup log', () => {
  it('writes one line with versions and times', () => {
    let t = 1000
    const log = createStartupLog({ dir, processStart: 1000, info, now: () => t })
    t = 1250; log.mark('ready')
    t = 1900; log.mark('shown')
    const line = log.write()
    expect(line).toContain('Booking 0.28.0 · arm64 · macOS 26.6.2 · ready 250 ms · shown 900 ms')
    expect(readFileSync(startupLogPath(dir), 'utf8')).toBe(line + '\n')
    expect(log.write()).toBeNull() // once per launch
  })

  it('keeps the last 100 launches', () => {
    for (let i = 0; i < 105; i++) createStartupLog({ dir, processStart: i * 1000, info }).write()
    const lines = readFileSync(startupLogPath(dir), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(100)
    expect(lines[0]).toContain(new Date(5000).toISOString())
  })

  it('says how long the restart after an update took, once', () => {
    markUpdateLaunch(dir, { from: '0.27.0', to: '0.28.0', now: 10_000 })
    const line = createStartupLog({ dir, processStart: 40_000, info }).write()
    expect(line).toContain('updated 0.27.0 → 0.28.0: 30.0 s from restart to Booking starting')
    expect(existsSync(join(dir, 'update-launch.json'))).toBe(false)
    expect(createStartupLog({ dir, processStart: 50_000, info }).write()).not.toContain('updated')
  })

  it('ignores a stale or broken marker', () => {
    markUpdateLaunch(dir, { from: 'a', to: 'b', now: 0 })
    expect(createStartupLog({ dir, processStart: 7 * 3600 * 1000, info }).write()).not.toContain('updated')
    writeFileSync(join(dir, 'update-launch.json'), '{nope')
    expect(createStartupLog({ dir, processStart: 1, info }).write()).not.toContain('updated')
    expect(existsSync(join(dir, 'update-launch.json'))).toBe(false)
  })

  it('never throws where it cannot write', () => {
    const file = join(dir, 'a-file')
    writeFileSync(file, '')
    const log = createStartupLog({ dir: join(file, 'sub'), processStart: 0, info })
    expect(() => log.mark('ready')).not.toThrow()
    expect(log.write()).toBeNull()
    expect(() => markUpdateLaunch(join(file, 'sub'))).not.toThrow()
  })
})
