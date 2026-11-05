import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/booking-secrets-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(s, 'utf8'),
    decryptString: b => b.toString('utf8'),
  },
}))

const { setSecret, getSecret, deleteSecret, __setKeychainForTests } = await import('../secrets.js')
let stored = ''
__setKeychainForTests({ read: () => stored, write: hex => { stored = hex } })

describe('secret key allowlist', () => {
  it('accepts the two original keys', () => {
    expect(() => setSecret('githubToken', 'x')).not.toThrow()
    expect(() => setSecret('imapPassword', 'x')).not.toThrow()
  })

  it('accepts a per-account mail password', () => {
    expect(() => setSecret('imapPassword:account-1', 'x')).not.toThrow()
    expect(getSecret('imapPassword:account-1')).toBe('x')
    deleteSecret('imapPassword:account-1')
  })

  it('keeps the default account on the original un-suffixed key', () => {
    setSecret('imapPassword', 'original')
    expect(getSecret('imapPassword')).toBe('original')
  })

  it('rejects anything else, including path-ish and injected keys', () => {
    for (const bad of ['', 'nonsense', 'imapPassword:', 'imapPassword:../etc', 'imapPassword:a/b', '__proto__']) {
      expect(() => getSecret(bad)).toThrow(/Unknown secret/)
    }
  })

  it('rejects an absurdly long account id', () => {
    expect(() => getSecret(`imapPassword:${'a'.repeat(65)}`)).toThrow(/Unknown secret/)
  })
})
