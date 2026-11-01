import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { bundleOf, replaceableBundle, stageUpdate, scheduleSwap, SWAP_SCRIPT, BUNDLE_ID } from '../ipc/selfInstall.js'

const scratch = () => mkdtemp(join(tmpdir(), 'selfinstall-test-'))

describe('where Booking can replace itself', () => {
  it('finds the bundle of the running executable', () => {
    expect(bundleOf('/Applications/Booking.app/Contents/MacOS/Booking')).toBe('/Applications/Booking.app')
    expect(bundleOf('/usr/local/bin/node')).toBe(null)
  })
  it('only for a packaged app in a writable folder, not a disk image or translocated copy', async () => {
    const yes = async () => true
    const exe = p => `${p}/Contents/MacOS/Booking`
    expect(await replaceableBundle({ isPackaged: true, exePath: exe('/Applications/Booking.app'), canWrite: yes })).toBe('/Applications/Booking.app')
    expect(await replaceableBundle({ isPackaged: false, exePath: exe('/Applications/Booking.app'), canWrite: yes })).toBe(null)
    expect(await replaceableBundle({ isPackaged: true, exePath: exe('/Volumes/Booking 0.16.1/Booking.app'), canWrite: yes })).toBe(null)
    expect(await replaceableBundle({ isPackaged: true, exePath: exe('/private/var/folders/x/AppTranslocation/ABC/d/Booking.app'), canWrite: yes })).toBe(null)
    expect(await replaceableBundle({ isPackaged: true, exePath: exe('/Applications/Booking.app'), canWrite: async () => false })).toBe(null)
  })
})

// A pretend hdiutil/ditto/plutil/codesign: the "mounted" image holds Booking.app.
function fakeShell({ id = BUNDLE_ID, version = '0.16.1', codesignOk = true } = {}) {
  const calls = []
  const sh = vi.fn(async (cmd, args) => {
    const tool = cmd.split('/').pop()
    calls.push([tool, args[0]])
    if (tool === 'hdiutil' && args[0] === 'attach') await mkdir(join(args.at(-2), 'Booking.app'), { recursive: true })
    if (tool === 'ditto') await mkdir(args[1], { recursive: true })
    if (tool === 'plutil') return args[1] === 'CFBundleIdentifier' ? `${id}\n` : `${version}\n`
    if (tool === 'codesign' && !codesignOk) throw new Error('codesign: invalid signature')
    return ''
  })
  return { sh, calls }
}

describe('stageUpdate', () => {
  it('copies the new app beside the old one, checks it, and unmounts', async () => {
    const dir = await scratch()
    const { sh, calls } = fakeShell()
    const stage = await stageUpdate({ dmg: '/x.dmg', bundle: join(dir, 'Booking.app'), version: '0.16.1', sh, tmp: dir })
    expect(stage).toBe(join(dir, '.Booking-update.app'))
    expect(existsSync(stage)).toBe(true)
    expect(calls.map(c => c[0])).toEqual(['hdiutil', 'ditto', 'plutil', 'plutil', 'codesign', 'xattr', 'hdiutil'])
    expect(calls.at(-1)).toEqual(['hdiutil', 'detach'])
    await rm(dir, { recursive: true, force: true })
  })
  it('refuses another app, another version or a bad signature, and leaves nothing behind', async () => {
    for (const opts of [{ id: 'com.evil.app' }, { version: '0.9.0' }, { codesignOk: false }]) {
      const dir = await scratch()
      const { sh, calls } = fakeShell(opts)
      await expect(stageUpdate({ dmg: '/x.dmg', bundle: join(dir, 'Booking.app'), version: '0.16.1', sh, tmp: dir })).rejects.toThrow()
      expect(existsSync(join(dir, '.Booking-update.app'))).toBe(false)
      expect(calls.at(-1)).toEqual(['hdiutil', 'detach'])
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('the swap after quitting', () => {
  it('waits for Booking to exit, then puts the new app in place of the old', async () => {
    const dir = await scratch()
    const app = join(dir, 'Booking.app')
    const stage = join(dir, '.Booking-update.app')
    await mkdir(app); await writeFile(join(app, 'v'), 'old')
    await mkdir(stage); await writeFile(join(stage, 'v'), 'new')
    const booking = spawn('/bin/sleep', ['0.5']) // stands in for the running app
    // The real script ends with `open "$app"`; the test mustn't open Finder.
    const quiet = SWAP_SCRIPT.replace('open "$app"', ': open')
    expect(quiet).not.toBe(SWAP_SCRIPT)
    await scheduleSwap({ stage, bundle: app, pid: booking.pid, tmp: dir, script: quiet })
    expect(await readFile(join(app, 'v'), 'utf8')).toBe('old') // not before the app quits
    await new Promise(r => setTimeout(r, 1500))
    expect(await readFile(join(app, 'v'), 'utf8')).toBe('new')
    expect((await readdir(dir)).sort()).toEqual(['Booking.app'])
    await rm(dir, { recursive: true, force: true })
  })
  it('is valid sh', () => {
    expect(() => execFileSync('/bin/sh', ['-n', '-c', SWAP_SCRIPT])).not.toThrow()
  })
})
