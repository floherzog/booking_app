import { ipcMain, app } from 'electron'

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
export function dmgForArch(assets, arch = process.arch) {
  const want = arch === 'arm64' ? 'arm64' : 'x64'
  const dmg = (assets || []).find(a => new RegExp(`-${want}\\.dmg$`, 'i').test(a?.name || ''))
  return dmg?.browser_download_url || null
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
    notes: data?.body || '',
    publishedAt: data?.published_at || '',
  }
}

export function registerUpdatesIpc() {
  ipcMain.handle('updates:check', () => checkForUpdates({ currentVersion: app.getVersion() }))
}
