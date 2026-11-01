import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: { isPackaged: true, getPath: () => '/tmp/booking-websync-test' }, safeStorage: {} }))
const { normalizeUrl, cookieFrom, createWebSync } = await import('../ipc/webSync.js')
const { normalizeSettings } = await import('../../core/settings.js')

// A web app in memory: login.php hands out the cookie for the right code,
// settings.php answers only with it (otherwise the gate redirects to login).
function fakeWebApp({ code = 'sesame', secret = 'c00kie', settings = null, token = '' } = {}) {
  const server = { settings, posts: 0 }
  const headers = (h = {}) => ({ get: k => h[k.toLowerCase()] ?? null, getSetCookie: () => (h['set-cookie'] ? [h['set-cookie']] : []) })
  const res = (status, body, h) => ({ status, ok: status >= 200 && status < 300, headers: headers(h), json: async () => JSON.parse(body) })
  server.fetch = async (url, opts = {}) => {
    const u = new URL(url)
    if (u.pathname.endsWith('/login.php')) {
      const pw = new URLSearchParams(opts.body).get('password')
      return pw === code ? res(302, '', { location: 'index.html', 'set-cookie': `booking_auth=${secret}; path=/app/; secure; HttpOnly` }) : res(200, '<html>', { 'content-type': 'text/html' })
    }
    if (opts.headers?.Cookie !== `booking_auth=${secret}`) return res(302, '', { location: 'login.php' })
    if (u.pathname.endsWith('/token.php')) return token ? res(200, JSON.stringify({ token }), { 'content-type': 'application/json' }) : res(404, '', {})
    if (opts.method === 'POST') { server.settings = JSON.parse(opts.body); server.posts++; return res(200, '{"ok":true}', { 'content-type': 'application/json' }) }
    return res(200, JSON.stringify(server.settings), { 'content-type': 'application/json' })
  }
  return server
}

function mac(initial = {}) {
  let disk = normalizeSettings(initial)
  const vault = {}
  return {
    disk: () => disk,
    vault,
    secrets: { get: k => vault[k] || '', has: k => !!vault[k], set: (k, v) => { vault[k] = v }, remove: k => { delete vault[k] } },
    store: { read: () => disk, write: next => (disk = normalizeSettings(next)) },
  }
}

describe('normalizeUrl', () => {
  it('points at the app folder, https only', () => {
    expect(normalizeUrl('https://example.com/booking_app')).toBe('https://example.com/booking_app/')
    expect(normalizeUrl('https://example.com/booking_app/index.html?x=1')).toBe('https://example.com/booking_app/')
    expect(normalizeUrl('http://example.com/booking_app/')).toBe(null)
    expect(normalizeUrl('http://localhost:8080/app/')).toBe(null)
    expect(normalizeUrl('http://localhost:8080/app/', { allowLocalHttp: true })).toBe('http://localhost:8080/app/')
    expect(normalizeUrl('not a url')).toBe(null)
  })
  it('reads the login cookie', () => {
    expect(cookieFrom({ getSetCookie: () => ['other=1', 'booking_auth=abc; path=/'] })).toBe('abc')
    expect(cookieFrom({ getSetCookie: () => [] })).toBe('')
  })
})

describe('web sync', () => {
  it('refuses a wrong access code and stores nothing', async () => {
    const web = fakeWebApp()
    const m = mac()
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    expect(await ws.connect('https://x.test/app/', 'nope')).toEqual({ error: 'code' })
    expect(m.vault).toEqual({})
  })

  it('connects, keeps only the cookie, and seeds an empty web app from the Mac', async () => {
    const web = fakeWebApp()
    const m = mac({ bands: [{ name: 'Trillmann' }], mail: { accounts: [{ id: 'a1', host: 'imap.mail.me.com', user: 'me' }] }, storage: { adapter: 'file', filePath: '/Users/me/list.csv' } })
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    expect(await ws.connect('https://x.test/app', 'sesame')).toMatchObject({ ok: true, remoteHasSettings: false })
    expect(m.vault).toEqual({ webSyncCookie: 'c00kie' })
    const r = await ws.sync()
    expect(r.error).toBeUndefined()
    expect(web.settings.bands.map(b => b.name)).toEqual(['Trillmann'])
    expect(JSON.stringify(web.settings)).not.toMatch(/imap\.mail\.me\.com|list\.csv|sesame/)
  })

  it('takes a newer change from the web app, and pushes a newer one from the Mac', async () => {
    const web = fakeWebApp({ settings: { bands: [{ name: 'Web Band' }], rules: { batchSize: 5 }, syncStamps: { bands: '2026-11-01T12:00:00Z', rules: '2026-11-01T09:00:00Z' } } })
    const m = mac({ bands: [{ name: 'Mac Band' }], syncStamps: { bands: '2026-11-01T10:00:00Z', rules: '2026-11-01T11:00:00Z' } })
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    await ws.connect('https://x.test/app/', 'sesame')
    const r = await ws.sync()
    expect(r.changedLocal).toBe(true)
    expect(m.disk().bands.map(b => b.name)).toEqual(['Web Band'])
    expect(web.settings.rules.batchSize).toBe(m.disk().rules.batchSize)
  })

  it('switches to the web app’s CSV when this Mac uses it', async () => {
    const web = fakeWebApp({ settings: { storage: { adapter: 'github', github: { repo: 'me/list', path: 'data/list.csv' } } } })
    const m = mac({ storage: { adapter: 'file', filePath: '/me.csv' } })
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    await ws.connect('https://x.test/app/', 'sesame')
    const r = await ws.sync({ first: 'web' })
    expect(r.storageChanged).toBe(true)
    expect(m.disk().storage).toMatchObject({ adapter: 'github', github: { repo: 'me/list', path: 'data/list.csv' } })
  })

  it('reports a stale sign-in', async () => {
    const web = fakeWebApp()
    const m = mac()
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    await ws.connect('https://x.test/app/', 'sesame')
    m.vault.webSyncCookie = 'old'
    expect(await ws.sync()).toEqual({ error: 'signin' })
  })

  it('takes the web app’s GitHub token along with its CSV, and gives it back on disconnect', async () => {
    const web = fakeWebApp({ token: 'github_pat_web', settings: { storage: { adapter: 'github', github: { repo: 'me/list', path: 'l.csv' } } } })
    const m = mac({ storage: { adapter: 'file', filePath: '/me.csv' } })
    const ws = createWebSync({ fetch: web.fetch, secrets: m.secrets, store: m.store })
    await ws.connect('https://x.test/app/', 'sesame')
    await ws.sync({ first: 'web' })
    expect(m.vault.githubToken).toBe('github_pat_web')
    expect(m.disk().webSync.tokenFromWeb).toBe(true)
    ws.disconnect()
    expect(m.vault.githubToken).toBeUndefined()
    expect(m.disk().webSync.tokenFromWeb).toBe(false)
  })

  it('never replaces a token of your own, nor takes one without the web app’s CSV', async () => {
    const settings = { storage: { adapter: 'github', github: { repo: 'me/list', path: 'l.csv' } } }
    const own = mac({ storage: { adapter: 'file', filePath: '/me.csv' } })
    own.vault.githubToken = 'mine'
    const ws = createWebSync({ fetch: fakeWebApp({ token: 'github_pat_web', settings }).fetch, secrets: own.secrets, store: own.store })
    await ws.connect('https://x.test/app/', 'sesame')
    await ws.sync({ first: 'web' })
    expect(own.vault.githubToken).toBe('mine')
    ws.disconnect()
    expect(own.vault.githubToken).toBe('mine')

    const off = mac({ storage: { adapter: 'file', filePath: '/me.csv' }, webSync: { useCsv: false } })
    const ws2 = createWebSync({ fetch: fakeWebApp({ token: 'github_pat_web', settings }).fetch, secrets: off.secrets, store: off.store })
    await ws2.connect('https://x.test/app/', 'sesame')
    await ws2.sync({ first: 'web' })
    expect(off.vault.githubToken).toBeUndefined()
  })
})
