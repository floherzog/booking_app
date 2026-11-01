import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app, safeStorage } from 'electron'

// Secrets are encrypted with Electron's safeStorage (macOS Keychain-backed) and
// stored base64 in userData/secrets.json. The renderer never receives a value —
// only `has…` booleans; every consumer of a secret runs in the main process.
// webSyncCookie: the web app's login cookie (ipc/webSync.js) — never the access code.
const KEYS = new Set(['githubToken', 'imapPassword', 'webSyncCookie'])

// One mail password per account: "imapPassword:<accountId>". The allowlist stays
// closed — the suffix is matched against a narrow character set rather than the
// list being opened up — because these keys come in over IPC from the renderer.
const PER_ACCOUNT_KEY = /^imapPassword:[A-Za-z0-9_-]{1,64}$/

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
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This Mac’s keychain is unavailable, so secrets cannot be stored securely.')
  }
  const raw = readRaw()
  if (!value) delete raw[key]
  else raw[key] = safeStorage.encryptString(String(value)).toString('base64')
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
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    // A rebuilt app with a different bundle identity invalidates safeStorage
    // blobs — treat as "not set" so the user is asked to re-enter it.
    return ''
  }
}
