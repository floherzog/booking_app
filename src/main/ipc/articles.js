import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ipcMain, app } from 'electron'

// German noun gender for venue names, from Apple's on-device model — and, for
// the "Liebe / Lieber" greeting, whether a contact's first name is a woman's or
// a man's (kind 'firstname': 'f' | 'm' | 'x').
//
// The model is reached through a small Swift executable (FoundationModels has no
// JS binding). Gender is context-free and never changes, so every answer is
// cached permanently — a venue costs one model call in its lifetime, which is the
// only reason this is viable for a list of three thousand.

const HELPER_TIMEOUT_MS = 120000
// Enough to keep a bulk run to a handful of spawns without risking the timeout.
const BATCH_SIZE = 25

function helperPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'helpers', 'article-helper')
    : join(app.getAppPath(), 'resources', 'helpers', 'bin', 'article-helper')
}

function cachePath() {
  return join(app.getPath('userData'), 'article_cache.json')
}

let cache = null

function atomicWriteJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(obj), 'utf8')
    renameSync(tmp, path)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
}

function loadCache() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), 'utf8'))
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    cache = {}
  }
  return cache
}

function remember(entries) {
  const c = loadCache()
  Object.assign(c, entries)
  try { atomicWriteJson(cachePath(), c) } catch { /* in-memory is still useful */ }
}

// Both kinds share one cache file; first names are kept under a prefix, so a
// venue called "Maria" and a contact called Maria never collide.
const KINDS = {
  venue: { prefix: '', values: ['m', 'f', 'n', 'pl'] },
  firstname: { prefix: 'name:', values: ['f', 'm', 'x'] },
}
const kindOf = kind => KINDS[kind] || KINDS.venue

// Manual corrections win over the model and are stored the same way, so a wrong
// answer is fixed once and stays fixed.
export function setOverride(name, gender, kind = 'venue') {
  const { prefix, values } = kindOf(kind)
  const bare = String(name || '').trim()
  if (!bare) return { ok: false, error: 'No name.' }
  const key = prefix + bare
  if (!values.includes(gender)) {
    // An empty gender clears the override and lets the model answer again.
    const c = loadCache()
    delete c[key]
    try { atomicWriteJson(cachePath(), c) } catch { /* ignore */ }
    return { ok: true, cleared: true }
  }
  remember({ [key]: gender })
  return { ok: true }
}

function runHelper(args, stdin) {
  return new Promise(resolve => {
    if (!existsSync(helperPath())) {
      resolve({ ok: false, status: 'missing', error: 'The language helper was not included in this build.' })
      return
    }
    const child = execFile(helperPath(), args, { timeout: HELPER_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve({ ok: false, status: 'failed', error: err.message })
          return
        }
        try {
          resolve(JSON.parse(String(stdout).trim().split('\n').pop()))
        } catch {
          resolve({ ok: false, status: 'failed', error: 'The language helper returned something unreadable.' })
        }
      })
    if (stdin !== undefined) {
      child.stdin.end(stdin)
    }
  })
}

export function checkAvailability() {
  return runHelper(['--availability'])
}

// names → { genders: { name: 'm'|'f'|'n'|'pl' }, status }, or for kind
// 'firstname' { name: 'f'|'m'|'x' }. Cached names never reach the helper, and
// an empty remainder never spawns it.
export async function resolveGenders(names = [], kind = 'venue') {
  const { prefix } = kindOf(kind)
  const c = loadCache()
  const wanted = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))]
  const known = {}
  const missing = []
  for (const name of wanted) {
    if (prefix + name in c) known[name] = c[prefix + name]
    else missing.push(name)
  }
  if (missing.length === 0) return { ok: true, status: 'available', genders: known, fromCache: wanted.length }

  let status = 'available'
  let error = null
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE)
    const result = await runHelper([], JSON.stringify(kind === 'firstname' ? { kind, names: batch } : { names: batch }))
    if (!result?.ok) {
      status = result?.status || 'failed'
      error = result?.error || 'The on-device model is unavailable.'
      break
    }
    const found = result.genders || {}
    if (Object.keys(found).length) {
      remember(Object.fromEntries(Object.entries(found).map(([k, v]) => [prefix + k, v])))
      Object.assign(known, found)
    }
  }

  return { ok: !error, status, error, genders: known, fromCache: wanted.length - missing.length }
}

export function registerArticlesIpc() {
  ipcMain.handle('articles:availability', () => checkAvailability())
  ipcMain.handle('articles:resolve', (_e, names, kind) => resolveGenders(names, kind))
  ipcMain.handle('articles:override', (_e, name, gender, kind) => setOverride(name, gender, kind))
}
