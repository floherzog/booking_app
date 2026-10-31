import { ipcMain, app, net, shell } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, rename, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join, extname, basename } from 'node:path'

// The app is distributed as a file you hand someone, so there is no auto-update
// feed. Instead we ask GitHub for the latest release of the public source repo
// and, when it is newer than the running build, point the user at the download.
const RELEASES_API = 'https://api.github.com/repos/floherzog/booking_app/releases/latest'
const RELEASES_PAGE = 'https://github.com/floherzog/booking_app/releases/latest'

// "v0.2.0" / "0.2.0-beta.1" → [0, 2, 0]. Pre-release suffixes are ignored: a
// tagged pre-release is treated as its base version, which is good enough for a
// two-person distribution and keeps the comparison total.
export function parseVersion(tag) {
  const m = String(tag || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!m) return null
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)]
}

// > 0 when a is newer than b, < 0 when older, 0 when equal or unparseable.
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

// The release's .dmg for this Mac — "Booking-0.6.0-arm64.dmg" on Apple Silicon,
// "-x64.dmg" on Intel — so Download fetches the file itself instead of opening
// the release page to hunt for it. null when the release has no such file.
export function dmgAssetForArch(assets, arch = process.arch) {
  const want = arch === 'arm64' ? 'arm64' : 'x64'
  return (assets || []).find(a => new RegExp(`-${want}\\.dmg$`, 'i').test(a?.name || '')) || null
}
export function dmgForArch(assets, arch = process.arch) {
  return dmgAssetForArch(assets, arch)?.browser_download_url || null
}

// `deps` is injectable so the tests never touch the network.
export async function checkForUpdates({ currentVersion, fetchImpl = fetch, arch = process.arch } = {}) {
  const current = currentVersion || '0.0.0'
  let res
  try {
    res = await fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'booking-app-mac' },
    })
  } catch {
    return { current, error: 'Could not reach GitHub. Check your internet connection.' }
  }
  if (res.status === 404) {
    return { current, newer: false, error: 'No release has been published yet.' }
  }
  if (res.status === 403) {
    return { current, error: 'GitHub rate limit reached. Try again in a few minutes.' }
  }
  if (!res.ok) {
    return { current, error: `GitHub returned ${res.status}.` }
  }

  let data
  try {
    data = await res.json()
  } catch {
    return { current, error: 'GitHub returned an unreadable response.' }
  }

  const latest = String(data?.tag_name || '').replace(/^v/i, '')
  if (!parseVersion(latest)) {
    return { current, error: 'The latest release has no recognizable version tag.' }
  }

  return {
    current,
    latest,
    newer: compareVersions(latest, current) > 0,
    url: data?.html_url || RELEASES_PAGE,
    // The direct file link; the page stays the fallback.
    downloadUrl: dmgForArch(data?.assets, arch),
    // What the in-app download needs to check the file it gets.
    download: (() => {
      const a = dmgAssetForArch(data?.assets, arch)
      return a ? { url: a.browser_download_url, name: a.name, size: a.size || 0, digest: a.digest || '' } : null
    })(),
    notes: data?.body || '',
    publishedAt: data?.published_at || '',
  }
}

// --- Downloading an update inside the app ------------------------------------
// A browser marks what it downloads as quarantined, and a quarantined copy of an
// unnotarised app can sit bouncing in the Dock for many minutes on first launch
// (hence the xattr step in the install notes). A file the app writes itself
// carries no such mark, so Download fetches the .dmg here, checks it against
// what GitHub says about it, and leaves it in Downloads ready to open.

// Only files from this repo's releases are ever fetched.
const DOWNLOAD_PREFIX = 'https://github.com/floherzog/booking_app/releases/download/'
export function isReleaseUrl(url) {
  return typeof url === 'string' && url.startsWith(DOWNLOAD_PREFIX) && !url.includes('..')
}

// "Booking-0.11.0-arm64.dmg", then "… (2).dmg", "… (3).dmg" — never over an
// existing file, the way browsers name a second download.
export async function freePath(dir, name, exists = defaultExists) {
  const ext = extname(name)
  const stem = basename(name, ext)
  for (let n = 1; n < 1000; n++) {
    const candidate = join(dir, n === 1 ? name : `${stem} (${n})${ext}`)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('Too many copies of this file in Downloads.')
}
async function defaultExists(path) {
  try { await access(path); return true } catch { return false }
}

// Takes the quarantine mark off (if there is one) and reports whether the file
// is clear of it. xattr runs directly, no shell; "no such xattr" is fine.
function runXattr(args) {
  return new Promise(resolve => execFile('/usr/bin/xattr', args, err => resolve(!err)))
}
export async function unquarantine(path) {
  await runXattr(['-d', 'com.apple.quarantine', path])
  const stillMarked = await runXattr(['-p', 'com.apple.quarantine', path])
  return !stillMarked
}

// Streams `url` into `dir`, checking size and SHA-256 (GitHub's `digest`,
// "sha256:…", when the release has one). Writes to "<name>.download" first and
// only names it properly once it checks out; anything else removes the part.
// Resolves { path, quarantineCleared }. Everything outside is injectable.
export async function downloadTo({ url, dir, name, size = 0, digest = '', fetchImpl = fetch, onProgress = () => {}, signal, clearQuarantine = unquarantine, exists = defaultExists }) {
  if (!isReleaseUrl(url)) throw new Error('Not a Booking release file.')
  if (!/^[\w.() -]+\.dmg$/.test(name || '')) throw new Error('Unexpected file name.')
  const part = join(dir, `${name}.download`)
  const hash = createHash('sha256')
  let received = 0
  try {
    const res = await fetchImpl(url, { signal })
    if (!res.ok || !res.body) throw new Error(`GitHub returned ${res.status}.`)
    const total = Number(res.headers?.get?.('content-length')) || size || 0
    const out = createWriteStream(part)
    const done = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject) })
    let last = 0
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.from(chunk)
        hash.update(buf)
        received += buf.length
        if (!out.write(buf)) await new Promise(r => out.once('drain', r))
        const now = Date.now()
        if (now - last > 100) { last = now; onProgress({ received, total }) }
      }
    } finally {
      out.end()
    }
    await done
    onProgress({ received, total: total || received })
    if (size && received !== size) throw new Error(`The download is incomplete (${received} of ${size} bytes).`)
    const want = String(digest || '').replace(/^sha256:/i, '').toLowerCase()
    if (want && hash.digest('hex') !== want) throw new Error('The downloaded file doesn’t match the release (checksum differs).')
    const path = await freePath(dir, name, exists)
    await rename(part, path)
    return { path, quarantineCleared: await clearQuarantine(path) }
  } catch (err) {
    await rm(part, { force: true })
    if (signal?.aborted) throw new Error('cancelled')
    throw err
  }
}

// Dev builds can pretend to be older to try the update flow against a real
// release: BOOKING_FAKE_VERSION=0.9.0 npm run dev. Ignored in a packaged app.
function currentVersion() {
  return (!app.isPackaged && process.env.BOOKING_FAKE_VERSION) || app.getVersion()
}

export function registerUpdatesIpc() {
  ipcMain.handle('updates:check', () => checkForUpdates({ currentVersion: currentVersion() }))

  let running = null // { controller } while a download is in progress
  let downloaded = '' // the last file this session downloaded — the only one Open/Reveal act on
  ipcMain.handle('updates:download', async event => {
    if (running) return { error: 'A download is already running.' }
    // The file to fetch comes from GitHub, never from the window.
    const update = await checkForUpdates({ currentVersion: currentVersion() })
    if (update.error) return { error: update.error }
    if (!update.newer || !update.download) return { error: 'There is no newer version to download for this Mac.' }
    const controller = new AbortController()
    running = { controller }
    const send = p => { if (!event.sender.isDestroyed()) event.sender.send('updates:progress', p) }
    try {
      const { path, quarantineCleared } = await downloadTo({
        ...update.download,
        dir: app.getPath('downloads'),
        fetchImpl: net.fetch.bind(net),
        signal: controller.signal,
        onProgress: send,
      })
      downloaded = path
      return { path, name: basename(path), version: update.latest, quarantineCleared }
    } catch (err) {
      if (err.message === 'cancelled') return { cancelled: true }
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        return { error: 'Booking isn’t allowed to save to Downloads. Allow it in System Settings ▸ Privacy & Security ▸ Files and Folders, or download in the browser.' }
      }
      return { error: err.message }
    } finally {
      running = null
    }
  })
  ipcMain.handle('updates:cancel', () => { running?.controller.abort() })
  ipcMain.handle('updates:open', async () => (downloaded ? shell.openPath(downloaded) : 'Nothing downloaded yet.'))
  ipcMain.handle('updates:reveal', () => { if (downloaded) shell.showItemInFolder(downloaded) })
}
