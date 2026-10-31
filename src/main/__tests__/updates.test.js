import { describe, it, expect, vi } from 'vitest'

// The module reaches for electron at import time, so it has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getVersion: () => '0.0.0' }, net: {}, shell: {} }))

const { parseVersion, compareVersions, checkForUpdates, dmgForArch } = await import('../ipc/updates.js')

// A stand-in for fetch that never touches the network.
function jsonResponse(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

describe('parseVersion', () => {
  it('accepts a bare or v-prefixed version', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0])
    expect(parseVersion('v1.10.3')).toEqual([1, 10, 3])
    expect(parseVersion('V2')).toEqual([2, 0, 0])
    expect(parseVersion('1.4')).toEqual([1, 4, 0])
  })

  it('ignores a pre-release suffix', () => {
    expect(parseVersion('0.3.0-beta.1')).toEqual([0, 3, 0])
  })

  it('returns null for anything unrecognizable', () => {
    expect(parseVersion('release')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion(null)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    // The string comparison people reach for first gets this one wrong.
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.2.1')).toBeLessThan(0)
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
  })

  it('treats an unparseable side as "no news"', () => {
    expect(compareVersions('nightly', '0.1.0')).toBe(0)
  })
})

describe('checkForUpdates', () => {
  it('reports a newer release', async () => {
    const r = await checkForUpdates({
      currentVersion: '0.1.0',
      fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0', html_url: 'https://example.com/r', body: 'notes' }),
    })
    expect(r).toMatchObject({ current: '0.1.0', latest: '0.2.0', newer: true, url: 'https://example.com/r' })
  })

  it('reports being up to date, and never treats an older tag as new', async () => {
    const same = await checkForUpdates({ currentVersion: '0.2.0', fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0' }) })
    expect(same.newer).toBe(false)
    const older = await checkForUpdates({ currentVersion: '0.3.0', fetchImpl: jsonResponse(200, { tag_name: 'v0.2.0' }) })
    expect(older.newer).toBe(false)
  })

  it('explains a missing release, a rate limit and an offline machine', async () => {
    expect((await checkForUpdates({ fetchImpl: jsonResponse(404, {}) })).error).toMatch(/no release/i)
    expect((await checkForUpdates({ fetchImpl: jsonResponse(403, {}) })).error).toMatch(/rate limit/i)
    const offline = await checkForUpdates({ fetchImpl: async () => { throw new Error('ENOTFOUND') } })
    expect(offline.error).toMatch(/internet|github/i)
  })

  it('never throws on a nonsense tag', async () => {
    const r = await checkForUpdates({ currentVersion: '0.1.0', fetchImpl: jsonResponse(200, { tag_name: 'latest' }) })
    expect(r.error).toMatch(/version tag/i)
    expect(r.newer).toBeUndefined()
  })
})

describe('dmgForArch', () => {
  const assets = [
    { name: 'Booking-0.6.0-arm64.dmg', browser_download_url: 'https://dl/arm.dmg' },
    { name: 'Booking-0.6.0-arm64.zip', browser_download_url: 'https://dl/arm.zip' },
    { name: 'Booking-0.6.0-x64.dmg', browser_download_url: 'https://dl/intel.dmg' },
  ]

  it('picks the .dmg for this Mac’s architecture, never the zip', () => {
    expect(dmgForArch(assets, 'arm64')).toBe('https://dl/arm.dmg')
    expect(dmgForArch(assets, 'x64')).toBe('https://dl/intel.dmg')
  })

  it('is null when the release has no matching file', () => {
    expect(dmgForArch([assets[1]], 'arm64')).toBeNull()
    expect(dmgForArch(undefined, 'arm64')).toBeNull()
  })

  it('comes back from checkForUpdates as downloadUrl, next to the page url', async () => {
    const fetchImpl = async () => ({
      ok: true, status: 200,
      json: async () => ({ tag_name: 'v9.0.0', html_url: 'https://page', assets }),
    })
    const r = await checkForUpdates({ currentVersion: '0.6.0', fetchImpl, arch: 'x64' })
    expect(r.downloadUrl).toBe('https://dl/intel.dmg')
    expect(r.url).toBe('https://page')
  })
})

describe('downloadTo', async () => {
  const { downloadTo, freePath, isReleaseUrl } = await import('../ipc/updates.js')
  const { mkdtemp, readdir, readFile, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createHash } = await import('node:crypto')

  const URL = 'https://github.com/floherzog/booking_app/releases/download/v9.9.9/Booking-9.9.9-arm64.dmg'
  const body = Buffer.from('a fake disk image, long enough to come in a few chunks '.repeat(50))
  const sha = 'sha256:' + createHash('sha256').update(body).digest('hex')
  // A fetch that streams `bytes` in chunks, optionally stopping for an abort.
  function streamFetch(bytes = body, { status = 200, chunk = 512 } = {}) {
    return async (_url, { signal } = {}) => ({
      ok: status === 200,
      status,
      headers: { get: k => (k === 'content-length' ? String(bytes.length) : null) },
      body: (async function* () {
        for (let i = 0; i < bytes.length; i += chunk) {
          if (signal?.aborted) throw new Error('aborted')
          yield bytes.subarray(i, i + chunk)
          await new Promise(r => setTimeout(r, 0))
        }
      })(),
    })
  }
  const base = async () => ({
    url: URL, dir: await mkdtemp(join(tmpdir(), 'booking-dl-')), name: 'Booking-9.9.9-arm64.dmg',
    size: body.length, digest: sha, clearQuarantine: async () => true,
  })

  it('streams the file, reports progress and names it properly once it checks out', async () => {
    const opts = await base()
    const seen = []
    const r = await downloadTo({ ...opts, fetchImpl: streamFetch(), onProgress: p => seen.push(p) })
    expect(r.path).toBe(join(opts.dir, opts.name))
    expect(r.quarantineCleared).toBe(true)
    expect(await readFile(r.path)).toEqual(body)
    expect(seen.at(-1)).toEqual({ received: body.length, total: body.length })
    expect(await readdir(opts.dir)).toEqual([opts.name])
  })

  it('refuses a file that does not match the release, and leaves nothing behind', async () => {
    const opts = await base()
    await expect(downloadTo({ ...opts, digest: 'sha256:' + '0'.repeat(64), fetchImpl: streamFetch() })).rejects.toThrow(/checksum/)
    await expect(downloadTo({ ...opts, size: body.length + 1, fetchImpl: streamFetch() })).rejects.toThrow(/incomplete/)
    await expect(downloadTo({ ...opts, fetchImpl: streamFetch(body, { status: 404 }) })).rejects.toThrow(/404/)
    expect(await readdir(opts.dir)).toEqual([])
  })

  it('stops on cancel and removes the part file', async () => {
    const opts = await base()
    const controller = new AbortController()
    const p = downloadTo({ ...opts, fetchImpl: streamFetch(), signal: controller.signal, onProgress: () => controller.abort() })
    await expect(p).rejects.toThrow('cancelled')
    expect(await readdir(opts.dir)).toEqual([])
  })

  it('never overwrites a file already in Downloads', async () => {
    const opts = await base()
    await writeFile(join(opts.dir, opts.name), 'mine')
    const r = await downloadTo({ ...opts, fetchImpl: streamFetch() })
    expect(r.path).toBe(join(opts.dir, 'Booking-9.9.9-arm64 (2).dmg'))
    expect(await readFile(join(opts.dir, opts.name), 'utf8')).toBe('mine')
    expect(await freePath(opts.dir, opts.name)).toBe(join(opts.dir, 'Booking-9.9.9-arm64 (3).dmg'))
  })

  it('only fetches this repo’s release files', async () => {
    expect(isReleaseUrl(URL)).toBe(true)
    for (const bad of ['https://evil.example/Booking.dmg', 'https://github.com/someone/else/releases/download/v1/x.dmg', URL.replace('download/', 'download/../../'), 42]) {
      expect(isReleaseUrl(bad)).toBe(false)
    }
    const opts = await base()
    await expect(downloadTo({ ...opts, url: 'https://evil.example/Booking.dmg', fetchImpl: streamFetch() })).rejects.toThrow(/release/)
    await expect(downloadTo({ ...opts, name: '../evil.dmg', fetchImpl: streamFetch() })).rejects.toThrow(/name/)
  })
})
