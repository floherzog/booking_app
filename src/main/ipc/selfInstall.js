import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

// Quit and install, without dragging anything: the new Booking.app is copied
// out of the downloaded .dmg next to the running one while Booking still runs,
// checked (signature, bundle id, version), and a small detached script swaps
// it in once Booking has quit, then opens it. The swap keeps the old copy until
// the new one is in place and puts it back if the move fails.
//
// Only where that can work: a packaged app in a folder it may write to, not
// running from a disk image or from macOS's translocated copy of a quarantined
// download. Anywhere else, updates.js falls back to opening the .dmg.

export const BUNDLE_ID = 'com.floherzog.booking'
const STAGE_NAME = '.Booking-update.app'

// …/Booking.app/Contents/MacOS/Booking → …/Booking.app
export function bundleOf(exePath) {
  const m = String(exePath || '').match(/^(\/.+?\.app)\/Contents\/MacOS\/[^/]+$/)
  return m ? m[1] : null
}

export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd.split('/').pop()}: ${String(stderr || err.message).trim()}`))
      else resolve(String(stdout))
    })
  })
}

// → the bundle path when it can be replaced in place, else null.
export async function replaceableBundle({ isPackaged, exePath, canWrite = defaultCanWrite }) {
  if (!isPackaged) return null
  const bundle = bundleOf(exePath)
  if (!bundle) return null
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return null
  return (await canWrite(dirname(bundle))) ? bundle : null
}
async function defaultCanWrite(dir) {
  try { await access(dir, constants.W_OK); return true } catch { return false }
}

const plist = (sh, app, key) => sh('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(app, 'Contents/Info.plist')]).then(s => s.trim())

// Copies the app out of `dmg` to a hidden folder beside `bundle` and checks it.
// → the staged path. Always unmounts.
export async function stageUpdate({ dmg, bundle, version, sh = run, tmp = tmpdir() }) {
  const mount = await mkdtemp(join(tmp, 'booking-update-'))
  const stage = join(dirname(bundle), STAGE_NAME)
  let attached = false
  try {
    await sh('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg])
    attached = true
    const name = (await readdir(mount)).find(n => n.endsWith('.app'))
    if (!name) throw new Error('No app in the downloaded disk image.')
    await rm(stage, { recursive: true, force: true })
    await sh('/usr/bin/ditto', [join(mount, name), stage])
    if ((await plist(sh, stage, 'CFBundleIdentifier')) !== BUNDLE_ID) throw new Error('The disk image holds a different app.')
    if (version && (await plist(sh, stage, 'CFBundleShortVersionString')) !== version) throw new Error('The disk image holds a different version.')
    await sh('/usr/bin/codesign', ['--verify', '--deep', '--strict', stage])
    await sh('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', stage]).catch(() => {})
    return stage
  } catch (err) {
    await rm(stage, { recursive: true, force: true })
    throw err
  } finally {
    if (attached) await sh('/usr/bin/hdiutil', ['detach', mount, '-quiet']).catch(() => sh('/usr/bin/hdiutil', ['detach', mount, '-force', '-quiet']).catch(() => {}))
    await rm(mount, { recursive: true, force: true }).catch(() => {})
  }
}

// Waits (up to two minutes) for `pid` to exit, swaps `stage` in for `bundle`,
// opens it. Paths arrive as arguments, never spliced into the script.
export const SWAP_SCRIPT = `#!/bin/sh
pid="$1"; new="$2"; app="$3"; old="$app.old-$$"
i=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.2; i=$((i+1))
  [ "$i" -gt 600 ] && { rm -rf "$new"; rm -f "$0"; exit 1; }
done
if mv "$app" "$old"; then
  if mv "$new" "$app"; then rm -rf "$old"; else mv "$old" "$app"; fi
fi
open "$app"
rm -f "$0"
`

export async function scheduleSwap({ stage, bundle, pid = process.pid, tmp = tmpdir(), spawnImpl = spawn, script: text = SWAP_SCRIPT }) {
  const script = join(tmp, `booking-swap-${pid}.sh`)
  await writeFile(script, text, { mode: 0o700 })
  const child = spawnImpl('/bin/sh', [script, String(pid), stage, bundle], { detached: true, stdio: 'ignore' })
  child.unref()
  return script
}
