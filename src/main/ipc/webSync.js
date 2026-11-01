import { ipcMain, app } from 'electron'
import { readSettings, writeSettings } from '../settingsStore.js'
import { getSecret, hasSecret, setSecret, deleteSecret } from '../secrets.js'
import { mergeSynced, stampAll } from '../../core/settingsSync.js'

// Settings ▸ General ▸ Sync with your web app. The web app is your own deploy of
// the web build (docs/WEB.md): settings.php behind the cookie gate of
// login.php/.htaccess. Connecting posts the access code to login.php once and
// keeps only the cookie it hands out, in the keychain. A sync then reads the web
// app's settings, merges them section by section (src/core/settingsSync.js) and
// writes back whichever side is behind.
//
// With "Also use the web app's CSV" a sync also takes the web app's GitHub
// token (token.php, the one its bundle carries) into the keychain — unless you
// entered a token of your own, which is never overwritten. `tokenFromWeb` in
// webSync records which it is; disconnecting removes a token that came this way.
//
// Node's fetch, not net.fetch: Chromium's fetch hides Set-Cookie, and a
// redirect must stay visible (a 302 to login.php means "signed out").

const COOKIE = 'booking_auth'

// "https://host/booking_app" (or …/index.html, …/login.php) → "https://host/booking_app/".
// http only for localhost, and only in a development run.
export function normalizeUrl(input, { allowLocalHttp = false } = {}) {
  let u
  try { u = new URL(String(input || '').trim()) } catch { return null }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(allowLocalHttp && local && u.protocol === 'http:')) return null
  u.search = ''
  u.hash = ''
  u.pathname = u.pathname.replace(/\/(index\.html|login\.php|settings\.php)$/, '/').replace(/\/?$/, '/')
  return u.toString()
}

// The cookie's value from a response's Set-Cookie headers, or ''.
export function cookieFrom(headers) {
  const all = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || '']
  for (const line of all) {
    const m = line.match(new RegExp(`(?:^|[;,]\\s*)${COOKIE}=([^;]*)`))
    if (m && m[1]) return m[1]
  }
  return ''
}

export function createWebSync({ fetch = globalThis.fetch, secrets, store, allowLocalHttp = false }) {
  async function remoteGet(base, cookie) {
    const res = await fetch(`${base}settings.php?key=settings`, { headers: { Cookie: `${COOKIE}=${cookie}` }, redirect: 'manual', cache: 'no-store' })
    if (res.status >= 300 && res.status < 400) return { signin: true }
    if (!res.ok) throw new Error(`The web app answered ${res.status}.`)
    if (!(res.headers.get('content-type') || '').includes('json')) throw new Error('That address doesn’t look like a Booking web app.')
    return { settings: await res.json() }
  }

  async function remotePut(base, cookie, value) {
    const res = await fetch(`${base}settings.php?key=settings`, {
      method: 'POST',
      headers: { Cookie: `${COOKIE}=${cookie}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) return { signin: true }
    if (!res.ok) throw new Error(`The web app could not save the settings (${res.status}).`)
    return {}
  }

  // The web app's GitHub token, or '' (none, or a deploy from before token.php).
  async function remoteToken(base, cookie) {
    try {
      const res = await fetch(`${base}token.php`, { headers: { Cookie: `${COOKIE}=${cookie}` }, redirect: 'manual', cache: 'no-store' })
      if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return ''
      const body = await res.json()
      return typeof body?.token === 'string' ? body.token.trim() : ''
    } catch {
      return ''
    }
  }

  // Take the web app's token when this Mac uses its CSV and has none of its
  // own; keep it current when it came from there. → whether it is in use now.
  async function adoptToken(base, cookie, webSync) {
    const own = secrets.has('githubToken') && !webSync.tokenFromWeb
    if (own) return false
    const token = await remoteToken(base, cookie)
    if (!token) return !!webSync.tokenFromWeb
    if (secrets.get('githubToken') !== token) secrets.set('githubToken', token)
    return true
  }

  // → { ok, url, remoteHasSettings } | { error }
  async function connect(url, code) {
    const base = normalizeUrl(url, { allowLocalHttp })
    if (!base) return { error: 'url' }
    let res
    try {
      res = await fetch(`${base}login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: String(code || '') }).toString(),
        redirect: 'manual',
      })
    } catch (e) {
      return { error: 'network', message: e.message }
    }
    const cookie = res.status >= 300 && res.status < 400 ? cookieFrom(res.headers) : ''
    if (!cookie) return { error: res.status === 200 ? 'code' : 'notBooking' }
    let got
    try { got = await remoteGet(base, cookie) } catch (e) { return { error: 'notBooking', message: e.message } }
    if (got.signin) return { error: 'code' }
    secrets.set('webSyncCookie', cookie)
    const s = store.read()
    store.write({ ...s, webSync: { ...s.webSync, url: base, lastSyncedAt: '' } }, { stamp: false })
    return { ok: true, url: base, remoteHasSettings: !!got.settings }
  }

  // `first`: on the first sync after connecting, whose settings win whole —
  // 'mac' or 'web'. → { settings, changedLocal, storageChanged } | { error }
  async function sync({ first } = {}) {
    const local = store.read()
    const base = local.webSync?.url
    if (!base) return { error: 'off' }
    const cookie = secrets.get('webSyncCookie')
    if (!cookie) return { error: 'signin' }
    try {
      const got = await remoteGet(base, cookie)
      if (got.signin) return { error: 'signin' }
      const now = new Date().toISOString()
      let l = local
      let r = got.settings || {}
      if (first === 'mac' || !got.settings) l = stampAll(l, now)
      else if (first === 'web') r = stampAll(r, now)
      const adoptCsv = local.webSync.useCsv !== false && !local.storage?.multiBand?.enabled
      const m = mergeSynced(l, r, { adoptCsv })
      if (m.changedRemote || !got.settings) {
        const put = await remotePut(base, cookie, m.remote)
        if (put.signin) return { error: 'signin' }
      }
      const usesWebCsv = adoptCsv && m.local.storage?.adapter === 'github'
      const tokenFromWeb = usesWebCsv ? await adoptToken(base, cookie, local.webSync) : !!local.webSync.tokenFromWeb
      const settings = store.write({ ...m.local, webSync: { ...local.webSync, lastSyncedAt: now, tokenFromWeb } }, { stamp: false })
      const storageChanged = JSON.stringify(settings.storage) !== JSON.stringify(local.storage)
      return { settings, changedLocal: m.changedLocal, storageChanged }
    } catch (e) {
      return { error: 'network', message: e.message }
    }
  }

  function disconnect() {
    secrets.remove('webSyncCookie')
    const s = store.read()
    if (s.webSync?.tokenFromWeb) secrets.remove('githubToken')
    return store.write({ ...s, webSync: { ...s.webSync, url: '', lastSyncedAt: '', tokenFromWeb: false } }, { stamp: false })
  }

  return { connect, sync, disconnect }
}

export function registerWebSyncIpc() {
  const ws = createWebSync({
    secrets: { get: k => getSecret(k), has: k => hasSecret(k), set: (k, v) => setSecret(k, v), remove: k => deleteSecret(k) },
    store: { read: readSettings, write: writeSettings },
    allowLocalHttp: !app.isPackaged,
  })
  ipcMain.handle('webSync:connect', (_e, url, code) => ws.connect(url, code))
  ipcMain.handle('webSync:sync', (_e, opts) => ws.sync(opts))
  ipcMain.handle('webSync:disconnect', () => ws.disconnect())
}
