import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { app, safeStorage } from 'electron'

// Secrets are encrypted (AES-256-GCM) and stored base64 in userData/secrets.json.
// The renderer never receives a value — only `has…` booleans; every consumer of
// a secret runs in the main process.
//
// The key they are encrypted with lives in the login keychain, and is only
// ever written and read through Apple's /usr/bin/security. Why not Electron's
// safeStorage ("Booking Safe Storage"), which this used until 0.24: the
// keychain ties an item to the app that made it, and for an app without an
// Apple Team ID that is the exact build (its cdhash) — every update was a
// stranger and macOS asked again, whatever certificate signed it. An item made
// by `security` belongs to `security`, which is the same on every update, so it
// is never asked about. The trade-off: any program running as this user could
// read it through `security` too, like a file only this user can read.
// Values from before are moved over once (migrateSecrets): one last prompt.
// webSyncCookie: the web app's login cookie (ipc/webSync.js) — never the access code.
const KEYS = new Set(['githubToken', 'imapPassword', 'webSyncCookie'])

// One mail password per account: "imapPassword:<accountId>". The allowlist stays
// closed — the suffix is matched against a narrow character set rather than the
// list being opened up — because these keys come in over IPC from the renderer.
const PER_ACCOUNT_KEY = /^imapPassword:[A-Za-z0-9_-]{1,64}$/

const KEY_SERVICE = 'Booking Secrets Key'
const KEY_ACCOUNT = 'Booking'
const SECURITY = '/usr/bin/security'
const V2 = 'v2:'

// The keychain, through `security`. Swappable for the tests.
let keychain = {
  read() {
    try {
      return execFileSync(SECURITY, ['find-generic-password', '-s', KEY_SERVICE, '-a', KEY_ACCOUNT, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch (e) {
      if (e.status === 44) return '' // not there yet
      throw new Error('The keychain could not be read, so the stored passwords can’t be used.')
    }
  },
  write(hex) {
    // Through stdin (`security -i`), so the key never shows in a process list.
    execFileSync(SECURITY, ['-i'], { input: `add-generic-password -U -s "${KEY_SERVICE}" -a "${KEY_ACCOUNT}" -w ${hex}\n`, stdio: ['pipe', 'ignore', 'pipe'] })
  },
}
export function __setKeychainForTests(k) { keychain = k; cachedKey = null }

let cachedKey = null
function masterKey() {
  if (cachedKey) return cachedKey
  let hex = keychain.read()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    hex = randomBytes(32).toString('hex')
    keychain.write(hex)
  }
  cachedKey = Buffer.from(hex, 'hex')
  return cachedKey
}

function encrypt(text) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', masterKey(), iv)
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
  return V2 + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
}
function decrypt(stored) {
  const buf = Buffer.from(stored.slice(V2.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', masterKey(), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

function secretsPath() {
  return join(app.getPath('userData'), 'secrets.json')
}

function readRaw() {
  try {
    const parsed = JSON.parse(readFileSync(secretsPath(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeRaw(obj) {
  const target = secretsPath()
  mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(obj), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, target)
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch { /* ignore */ } }
    throw e
  }
}

function assertKey(key) {
  if (KEYS.has(key) || PER_ACCOUNT_KEY.test(key)) return
  throw new Error(`Unknown secret "${key}"`)
}

export function setSecret(key, value) {
  assertKey(key)
  const raw = readRaw()
  if (!value) delete raw[key]
  else raw[key] = encrypt(value)
  writeRaw(raw)
  return true
}

export function hasSecret(key) {
  assertKey(key)
  return !!readRaw()[key]
}

export function deleteSecret(key) {
  assertKey(key)
  const raw = readRaw()
  delete raw[key]
  writeRaw(raw)
  return true
}

// Main-process only. Never expose this over IPC.
export function getSecret(key) {
  assertKey(key)
  const stored = readRaw()[key]
  if (!stored) return ''
  try {
    return stored.startsWith(V2) ? decrypt(stored) : safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    // Unreadable (a key that is gone, a prompt denied): treat as "not set" so
    // the user is asked to enter it again.
    return ''
  }
}

// Once, at launch: secrets still in safeStorage's form move to the keychain
// key above. Reading them costs the old prompt one last time; denied, they
// stay as they are and the next launch tries again. → how many moved.
export function migrateSecrets() {
  const raw = readRaw()
  const old = Object.keys(raw).filter(k => raw[k] && !String(raw[k]).startsWith(V2))
  if (!old.length) return 0
  let moved = 0
  for (const k of old) {
    try {
      raw[k] = encrypt(safeStorage.decryptString(Buffer.from(raw[k], 'base64')))
      moved++
    } catch {
      return 0 // the keychain said no: keep everything as it was
    }
  }
  writeRaw(raw)
  return moved
}
