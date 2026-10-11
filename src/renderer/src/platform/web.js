import { normalizeSettings } from '@core/settings'

// The web build's side of the platform seam: the same `api` the preload exposes
// in the Mac app (src/preload/index.js), built on what a browser has: the GitHub
// API for the CSV, and a small PHP store on the host (web/public/settings.php)
// for settings and the geocoding cache. Whatever a browser cannot do is listed
// in UNSUPPORTED with the capability flag that hides it in the UI.
//
// The site sits behind a cookie login (web/public/.htaccess), which is what
// makes a build-time GitHub token in the bundle acceptable at all.

export const caps = {
  platform: 'web',
  localFiles: false,
  multiBand: false,     // OpenClaw reads one CSV; band files are a Mac feature
  mail: false,          // OpenClaw drafts and sends, driven by the Draft/Auto flags
  articles: false,
  updates: false,       // a deploy is the update
  storageChoice: false, // GitHub only
  openclawPolicy: true,
}

// method → the capability that hides every UI path to it. apiCoverage.test.js
// checks that each one is false in `caps` above and true in the Mac build.
export const UNSUPPORTED = {
  pickCsvOpen: 'localFiles',
  pickCsvSave: 'localFiles',
  pickCsvOpenMany: 'localFiles',
  readCsvFile: 'localFiles',
  writeCsvFile: 'localFiles',
  createCsvFile: 'localFiles',
  readCsvFiles: 'multiBand',
  writeCsvFiles: 'multiBand',
  moveFile: 'multiBand',
  fileExists: 'multiBand',
  listCsvFiles: 'multiBand',
  getTemplate: 'mail',
  saveTemplate: 'mail',
  deleteTemplate: 'mail',
  saveTemplateAsset: 'mail',
  fetchVideoThumb: 'mail',
  testMailConnection: 'mail',
  verifySmtp: 'mail',
  appendDraft: 'mail',
  syncMail: 'mail',
  sendMail: 'mail',
  appleScriptDraft: 'mail',
  appleScriptCheck: 'mail',
  listScheduledRuns: 'mail',
  scheduleRun: 'mail',
  cancelScheduledRun: 'mail',
  reportScheduledRun: 'mail',
  articleAvailability: 'articles',
  resolveGenders: 'articles',
  setGenderOverride: 'articles',
  checkForUpdates: 'updates',
}

const BASE = import.meta.env.BASE_URL || '/'
const env = import.meta.env

// Where a fresh install looks, before anything is configured. Set by the deploy
// workflow, so the public source names no one's repository.
const WEB_DEFAULTS = {
  csvRepo: env.VITE_CSV_REPO || '',
  csvPath: env.VITE_CSV_PATH || '',
  openclawRepo: env.VITE_OPENCLAW_REPO || '',
  openclawPath: env.VITE_OPENCLAW_PATH || '',
}

// --- small helpers ------------------------------------------------------------

function local(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null')
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* private mode / storage full: the server copy still counts */ }
  return undefined
}

// The PHP store. → the stored JSON, null when nothing is stored yet, or
// undefined when there is no store at all (the Vite dev server runs no PHP).
async function serverGet(key) {
  try {
    const res = await fetch(`${BASE}settings.php?key=${key}`, { cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

async function serverPut(key, value) {
  const res = await fetch(`${BASE}settings.php?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
  if (!res.ok) throw new Error(`Could not save ${key} on the server (${res.status}).`)
}

function unsupported(name) {
  return () => Promise.reject(new Error(`${name} is not available in the web app.`))
}

// --- settings -----------------------------------------------------------------

const SETTINGS_KEY = 'booking_settings'
let serverStore = false // whether settings.php answered; decides where Save goes

// The web build always reads one CSV from GitHub; whatever a settings object
// says about local files or band files does not apply here.
function forWeb(settings) {
  const s = normalizeSettings(settings)
  const github = {
    repo: s.storage.github.repo || WEB_DEFAULTS.csvRepo,
    path: s.storage.github.path || WEB_DEFAULTS.csvPath,
  }
  const openclaw = {
    repo: s.openclaw?.repo ?? WEB_DEFAULTS.openclawRepo,
    path: s.openclaw?.path ?? WEB_DEFAULTS.openclawPath,
  }
  return {
    ...s,
    storage: { ...s.storage, adapter: 'github', github, multiBand: { ...s.storage.multiBand, enabled: false } },
    openclaw,
  }
}

// What the old web app kept in this browser (localStorage) and on the server
// (dismissed duplicate pairs), as a settings object. Used once, when the server
// has no settings yet.
async function legacySettings() {
  const old = local('booking_app_config') || {}
  const serverPairs = await serverGet('dismissed')
  const localPairs = local('booking_dismissed_dupes')
  const dismissedDupes = [...new Set([
    ...(Array.isArray(serverPairs) ? serverPairs : []),
    ...(Array.isArray(localPairs) ? localPairs : []),
  ])]
  return {
    storage: { adapter: 'github', github: { repo: old.csvRepo || '', path: old.csvPath || '' } },
    openclaw: old.scriptRepo || old.scriptPath ? { repo: old.scriptRepo || '', path: old.scriptPath || '' } : undefined,
    bands: old.bands || [],
    dismissedDupes,
  }
}

async function getSettings() {
  const stored = await serverGet('settings')
  serverStore = stored !== undefined
  if (stored) return forWeb(stored)
  // This browser's copy seeds a server that has none yet (a fresh deploy folder).
  const cached = local(SETTINGS_KEY)
  if (cached) {
    const settings = forWeb(cached)
    if (serverStore) await serverPut('settings', settings).catch(() => {})
    return settings
  }
  const migrated = forWeb(await legacySettings())
  local(SETTINGS_KEY, migrated)
  if (serverStore) await serverPut('settings', migrated).catch(() => {})
  return migrated
}

async function setSettings(next) {
  const saved = forWeb(next)
  local(SETTINGS_KEY, saved)
  if (serverStore) await serverPut('settings', saved)
  return saved
}

// --- the GitHub token -----------------------------------------------------------
// Baked in at build time for the deployed site; otherwise typed into the
// first-run screen and kept in this browser, as the old web app did.

const TOKEN_KEY = 'booking_github_token'

function githubToken() {
  if (env.VITE_GITHUB_TOKEN) return env.VITE_GITHUB_TOKEN
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

async function setSecret(key, value) {
  if (key !== 'githubToken') throw new Error('Only the GitHub token can be stored in the web app.')
  try { localStorage.setItem(TOKEN_KEY, value) } catch { /* ignore */ }
}

async function hasSecret(key) {
  return key === 'githubToken' && !!githubToken()
}

async function deleteSecret(key) {
  if (key !== 'githubToken') return
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

// --- GitHub storage -------------------------------------------------------------
// The same contract as src/main/ipc/github.js: fetch → { text, sha }, push
// refuses (CSV_CONFLICT) when the file changed since it was loaded.

function contentsUrl(repo, path) {
  return `https://api.github.com/repos/${repo}/contents/${path}`
}

function requireToken() {
  const token = githubToken()
  if (!token) throw new Error('GITHUB_TOKEN_MISSING: enter a GitHub token to load the list.')
  return token
}

function decodeBase64Utf8(b64) {
  const bin = atob((b64 || '').replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function githubFetchCsv({ repo, path }) {
  const token = requireToken()
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
  const res = await fetch(contentsUrl(repo, path), { headers, cache: 'no-store' })
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText)
    throw new Error(`GitHub API ${res.status}: ${msg}`)
  }
  const body = await res.json()
  // Files over 1 MB come without inline content; ask for the raw bytes then.
  if (body.encoding === 'base64' && body.content) return { text: decodeBase64Utf8(body.content), sha: body.sha }
  const raw = await fetch(contentsUrl(repo, path), {
    headers: { ...headers, Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store',
  })
  if (!raw.ok) throw new Error(`GitHub API ${raw.status}`)
  return { text: await raw.text(), sha: body.sha }
}

async function githubPushCsv({ repo, path, text, message, expectedSha }) {
  const token = requireToken()
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
  const metaRes = await fetch(contentsUrl(repo, path), { headers, cache: 'no-store' })
  if (!metaRes.ok) throw new Error(`Could not fetch file metadata: ${metaRes.status}`)
  const { sha } = await metaRes.json()
  if (expectedSha && sha !== expectedSha) {
    throw new Error('CSV_CONFLICT: the file changed on GitHub since it was loaded.')
  }
  const pushRes = await fetch(contentsUrl(repo, path), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: encodeBase64Utf8(text), sha }),
  })
  if (!pushRes.ok) {
    const body = await pushRes.json().catch(() => ({}))
    throw new Error(body.message || `Push failed: ${pushRes.status}`)
  }
  const body = await pushRes.json().catch(() => ({}))
  return { sha: body.content?.sha }
}

// OpenClaw's batch script, read only to warn when its hold logic drifts from the
// rules the app classifies with (see lib/policySync.js).
async function fetchOpenclawScript({ repo, path }) {
  const token = githubToken()
  if (!token || !repo || !path) return null
  try {
    const res = await fetch(contentsUrl(repo, path), {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3.raw' },
      cache: 'no-store',
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

// --- files ---------------------------------------------------------------------

async function exportCsv(text, defaultName) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName || 'booking.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return defaultName
}

// --- geocoding -----------------------------------------------------------------
// Three layers, merged: the snapshot deployed with the site (refreshed by the
// deploy workflow), cities found since then (shared through settings.php so the
// phone and the desktop look each one up once), and this browser's own copy.

const GEO_LOCAL = 'booking_geo_cache'
const THROTTLE_MS = 1100 // Nominatim: at most one request per second
let geo = null
let geoLive = {}
let geoSaveTimer = null

async function loadGeo() {
  if (geo) return geo
  const [seed, live] = await Promise.all([
    fetch(`${BASE}geo_cache.json`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    serverGet('geocache'),
  ])
  geoLive = live && typeof live === 'object' && !Array.isArray(live) ? live : {}
  geo = { ...seed, ...geoLive, ...(local(GEO_LOCAL) || {}) }
  return geo
}

function rememberGeo(key, value) {
  geo[key] = value
  geoLive = { ...geoLive, [key]: value }
  local(GEO_LOCAL, { ...(local(GEO_LOCAL) || {}), [key]: value })
  clearTimeout(geoSaveTimer)
  geoSaveTimer = setTimeout(() => { serverPut('geocache', geoLive).catch(() => {}) }, 3000)
}

const geoQueue = []
const geoInFlight = new Map()
let geoBusy = false

function pumpGeo() {
  if (geoBusy || geoQueue.length === 0) return
  geoBusy = true
  const { city, country, key, resolve } = geoQueue.shift()
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1`
  fetch(url)
    .then(r => (r.ok ? r.json() : []))
    .then(data => {
      const result = data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
      rememberGeo(key, result)
      resolve(result)
    })
    .catch(() => resolve(null))
    .finally(() => {
      geoInFlight.delete(key)
      setTimeout(() => { geoBusy = false; pumpGeo() }, THROTTLE_MS)
    })
}

async function geocode(city = '', country = '') {
  const key = `${city}||${country}`
  const cache = await loadGeo()
  if (key in cache) return cache[key]
  if (geoInFlight.has(key)) return geoInFlight.get(key)
  if (!city && !country) return null
  const p = new Promise(resolve => {
    geoQueue.push({ city, country, key, resolve })
    pumpGeo()
  })
  geoInFlight.set(key, p)
  return p
}

async function geoCacheSnapshot() {
  return { ...(await loadGeo()) }
}

// --- the api ---------------------------------------------------------------------

const noopSubscription = () => () => {}

export const api = {
  getSettings,
  setSettings,
  setSecret,
  hasSecret,
  deleteSecret,
  // A browser never reveals where a picked file lives.
  filePathFor: () => '',
  exportCsv,
  githubFetchCsv,
  githubPushCsv,
  // No templates on the web: the list is simply empty.
  listTemplates: async () => [],
  geocode,
  geoCacheSnapshot,
  getAppVersion: async () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''),
  openExternal: async url => { window.open(url, '_blank', 'noopener') },
  // Nothing on the web pushes menu, update or scheduler events.
  onMenu: noopSubscription,
  onUpdateAvailable: noopSubscription,
  onScheduleUpdate: noopSubscription,
  // Web only.
  fetchOpenclawScript,
  githubTokenBuiltIn: () => !!env.VITE_GITHUB_TOKEN,
  ...Object.fromEntries(Object.keys(UNSUPPORTED).map(name => [name, unsupported(name)])),
}
