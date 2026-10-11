import { describe, it, expect, beforeEach, vi } from 'vitest'

// The web build's settings: migrated once from what the old web app left in the
// browser and on the server, then kept on the server through settings.php.

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data,
  }
}

// A settings.php double: GET returns what is stored (or `null`), POST stores.
function fakeServer(store) {
  return vi.fn(async (url, opts = {}) => {
    const key = new URL(url, 'http://x').searchParams.get('key')
    if (opts.method === 'POST') {
      store[key] = JSON.parse(opts.body)
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) }
    }
    const value = key in store ? store[key] : (key === 'dismissed' ? [] : null)
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => value }
  })
}

async function freshWeb() {
  vi.resetModules()
  return import('../web')
}

describe('web settings', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('migrates the old web app’s config and dismissed pairs, and stores them on the server', async () => {
    const server = { dismissed: ['a:::x|||a:::y'] }
    vi.stubGlobal('fetch', fakeServer(server))
    vi.stubGlobal('localStorage', memoryStorage({
      booking_app_config: JSON.stringify({
        csvRepo: 'me/list', csvPath: 'data/list.csv',
        scriptRepo: 'me/claw', scriptPath: 'scripts/batch.py',
        bands: [{ name: 'Band A', tourDates: 'May 2027', bookFiller: true }, 'Band B'],
      }),
      booking_dismissed_dupes: JSON.stringify(['b:::x|||b:::y']),
    }))
    const { api } = await freshWeb()
    const s = await api.getSettings()

    expect(s.storage).toMatchObject({ adapter: 'github', github: { repo: 'me/list', path: 'data/list.csv' } })
    expect(s.storage.multiBand.enabled).toBe(false)
    expect(s.openclaw).toEqual({ repo: 'me/claw', path: 'scripts/batch.py' })
    expect(s.bands.map(b => [b.name, b.tourDates, b.bookFiller])).toEqual([
      ['Band A', 'May 2027', true],
      ['Band B', '', false],
    ])
    expect(new Set(s.dismissedDupes)).toEqual(new Set(['a:::x|||a:::y', 'b:::x|||b:::y']))
    expect(server.settings.storage.github.repo).toBe('me/list')
  })

  it('prefers the server copy, and saves back to it', async () => {
    const server = { settings: { storage: { github: { repo: 'srv/list', path: 'l.csv' } }, venueTypes: ['main', 'club'] } }
    vi.stubGlobal('fetch', fakeServer(server))
    vi.stubGlobal('localStorage', memoryStorage({ booking_app_config: JSON.stringify({ csvRepo: 'old/list' }) }))
    const { api } = await freshWeb()
    const s = await api.getSettings()
    expect(s.storage.github.repo).toBe('srv/list')
    expect(s.venueTypes).toEqual(['main', 'club'])

    // Whatever the UI sends, the web build stays on GitHub with one CSV.
    const saved = await api.setSettings({ ...s, storage: { ...s.storage, adapter: 'file', multiBand: { enabled: true } } })
    expect(saved.storage.adapter).toBe('github')
    expect(saved.storage.multiBand.enabled).toBe(false)
    expect(server.settings.storage.adapter).toBe('github')
  })

  it('seeds an empty server with this browser’s copy', async () => {
    const server = {}
    vi.stubGlobal('fetch', fakeServer(server))
    vi.stubGlobal('localStorage', memoryStorage({
      booking_settings: JSON.stringify({ storage: { github: { repo: 'me/list', path: 'l.csv' } }, venueTypes: ['main', 'bar'] }),
      booking_app_config: JSON.stringify({ csvRepo: 'old/list' }),
    }))
    const { api } = await freshWeb()
    const s = await api.getSettings()
    expect(s.storage.github.repo).toBe('me/list')
    expect(server.settings.venueTypes).toEqual(['main', 'bar'])
  })

  it('works without a server (the dev server runs no PHP)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, headers: { get: () => 'text/html' } })))
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const { api } = await freshWeb()
    const s = await api.getSettings()
    await api.setSettings({ ...s, venueTypes: ['main', 'bar'] })
    expect(JSON.parse(storage.getItem('booking_settings')).venueTypes).toEqual(['main', 'bar'])
  })
})
