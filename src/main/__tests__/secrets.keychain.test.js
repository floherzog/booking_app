import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'booking-secrets-'))
const safe = vi.hoisted(() => ({ deny: false }))
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(`old:${s}`, 'utf8'),
    decryptString: b => { if (safe.deny) throw new Error('denied'); return b.toString('utf8').replace(/^old:/, '') },
  },
}))
const { setSecret, getSecret, migrateSecrets, __setKeychainForTests } = await import('../secrets.js')

describe('secrets under a key kept by Apple’s security tool', () => {
  it('encrypts with a key it makes once, and never stores the value in the clear', () => {
    let key = ''
    const writes = vi.fn(hex => { key = hex })
    __setKeychainForTests({ read: () => key, write: writes })
    setSecret('githubToken', 'ghp_secret')
    setSecret('imapPassword', 'pw')
    expect(writes).toHaveBeenCalledTimes(1)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    const file = readFileSync(join(dir, 'secrets.json'), 'utf8')
    expect(file).not.toContain('ghp_secret')
    expect(JSON.parse(file).githubToken).toMatch(/^v2:/)
    expect(getSecret('githubToken')).toBe('ghp_secret')
    // A new launch reads the same key back.
    __setKeychainForTests({ read: () => key, write: writes })
    expect(getSecret('imapPassword')).toBe('pw')
  })

  it('moves safeStorage values over once, and leaves them when the keychain says no', () => {
    let key = ''
    __setKeychainForTests({ read: () => key, write: hex => { key = hex } })
    const legacy = { 'imapPassword:a1': Buffer.from('old:mailpw').toString('base64'), githubToken: Buffer.from('old:tok').toString('base64') }
    writeFileSync(join(dir, 'secrets.json'), JSON.stringify(legacy))
    safe.deny = true
    expect(migrateSecrets()).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8'))).toEqual(legacy)
    safe.deny = false
    expect(migrateSecrets()).toBe(2)
    const after = JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8'))
    expect(Object.values(after).every(v => v.startsWith('v2:'))).toBe(true)
    safe.deny = true // safeStorage is not needed any more
    expect(getSecret('imapPassword:a1')).toBe('mailpw')
    expect(getSecret('githubToken')).toBe('tok')
    expect(migrateSecrets()).toBe(0)
  })
})
