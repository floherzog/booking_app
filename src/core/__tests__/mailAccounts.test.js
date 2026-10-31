import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ACCOUNT_ID, secretKeyFor, normalizeAccount, normalizeAccounts,
  accountById, accountIdForBand, accountForRow, accountLabel,
  hasMultipleAccounts, nextAccountId, hasMailAccount,
} from '../mailAccounts.js'

describe('secretKeyFor', () => {
  it('keeps the original key for the default account, so an upgrade strands nothing', () => {
    expect(secretKeyFor(DEFAULT_ACCOUNT_ID)).toBe('imapPassword')
    expect(secretKeyFor('')).toBe('imapPassword')
    expect(secretKeyFor(undefined)).toBe('imapPassword')
  })
  it('namespaces every other account', () => {
    expect(secretKeyFor('account-1')).toBe('imapPassword:account-1')
  })
})

describe('normalizeAccounts — migration from the single-account shape', () => {
  it('turns the old flat mail fields into one default account', () => {
    const accounts = normalizeAccounts({
      host: 'imap.gmail.com', port: 993, user: 'me@gmail.com',
      fromAddress: 'me@gmail.com', fromName: 'Me', draftsMailbox: 'Drafts',
    })
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      id: 'default', host: 'imap.gmail.com', user: 'me@gmail.com', fromName: 'Me',
    })
  })

  it('clears the old hardcoded iCloud SMTP host on a non-iCloud account', () => {
    // This was never a choice: the default was written into every settings.json.
    const [a] = normalizeAccounts({ host: 'imap.gmail.com', smtpHost: 'smtp.mail.me.com' })
    expect(a.smtpHost).toBe('')
  })

  it('keeps that SMTP host on an actual iCloud account', () => {
    const [a] = normalizeAccounts({ host: 'imap.mail.me.com', smtpHost: 'smtp.mail.me.com' })
    expect(a.smtpHost).toBe('smtp.mail.me.com')
  })

  it('leaves a deliberately chosen SMTP host alone', () => {
    const [a] = normalizeAccounts({ host: 'imap.gmail.com', smtpHost: 'smtp.sendgrid.net' })
    expect(a.smtpHost).toBe('smtp.sendgrid.net')
  })

  it('always returns at least one account, even from nothing', () => {
    expect(normalizeAccounts()).toHaveLength(1)
    expect(normalizeAccounts({}).at(0).id).toBe('default')
    expect(normalizeAccounts({ accounts: [] })).toHaveLength(1)
  })

  it('reads a real accounts list and keeps the first as default', () => {
    const accounts = normalizeAccounts({
      accounts: [{ id: 'default', user: 'a@b.com' }, { id: 'account-1', user: 'c@d.com' }],
    })
    expect(accounts.map(a => a.id)).toEqual(['default', 'account-1'])
  })

  it('de-duplicates ids, so two accounts never share one keychain entry', () => {
    const accounts = normalizeAccounts({
      accounts: [{ id: 'x', user: 'a@b.com' }, { id: 'x', user: 'c@d.com' }],
    })
    expect(accounts.map(a => a.id)).toEqual(['x', 'x-2'])
  })

  it('coerces numeric fields that arrive as strings from form inputs', () => {
    const [a] = normalizeAccounts({ accounts: [{ port: '993', smtpPort: '465' }] })
    expect(a.port).toBe(993)
    expect(a.smtpPort).toBe(465)
  })
})

describe('accountIdForBand', () => {
  const bands = [
    { name: 'Band A', mailAccountId: 'account-1' },
    { name: 'Band B' },
  ]

  it('finds the account a band is assigned to', () => {
    expect(accountIdForBand(bands, 'Band A')).toBe('account-1')
  })
  it('falls back to the default for an unassigned band', () => {
    expect(accountIdForBand(bands, 'Band B')).toBe('default')
  })
  it('falls back for a band that is not managed at all', () => {
    expect(accountIdForBand(bands, 'Some Other Band')).toBe('default')
  })
  it('matches case- and whitespace-insensitively', () => {
    expect(accountIdForBand(bands, '  band a ')).toBe('account-1')
  })
  it('falls back for a blank band', () => {
    expect(accountIdForBand(bands, '')).toBe('default')
    expect(accountIdForBand(null, 'Band A')).toBe('default')
  })
  it('tolerates the legacy bare-string band shape', () => {
    expect(accountIdForBand(['Band A'], 'Band A')).toBe('default')
  })
})

describe('accountForRow', () => {
  const settings = {
    mail: { accounts: [{ id: 'default', user: 'main@x.com' }, { id: 'account-1', user: 'side@x.com' }] },
    bands: [{ name: 'Band A', mailAccountId: 'account-1' }],
  }

  it('routes a row through its band', () => {
    expect(accountForRow({ Band: 'Band A' }, settings).user).toBe('side@x.com')
  })
  it('uses the default account otherwise', () => {
    expect(accountForRow({ Band: 'Band B' }, settings).user).toBe('main@x.com')
    expect(accountForRow({}, settings).user).toBe('main@x.com')
  })
  it('survives an account id that no longer exists', () => {
    const stale = { ...settings, bands: [{ name: 'Band A', mailAccountId: 'deleted' }] }
    expect(accountForRow({ Band: 'Band A' }, stale).user).toBe('main@x.com')
  })
})

describe('accountById', () => {
  const accounts = [{ id: 'default', user: 'a' }, { id: 'x', user: 'b' }]
  it('finds by id', () => expect(accountById(accounts, 'x').user).toBe('b'))
  it('falls back to the first for an unknown id', () => expect(accountById(accounts, 'nope').user).toBe('a'))
  it('never returns undefined', () => expect(accountById([], 'x')).toBeTruthy())
})

describe('accountLabel', () => {
  it('prefers the label, then the address, then the username', () => {
    expect(accountLabel({ label: 'Tour mail', fromAddress: 'a@b.com' })).toBe('Tour mail')
    expect(accountLabel({ fromAddress: 'a@b.com', user: 'u' })).toBe('a@b.com')
    expect(accountLabel({ user: 'u' })).toBe('u')
    expect(accountLabel({})).toBe('Unnamed account')
  })
})

describe('hasMultipleAccounts / nextAccountId', () => {
  it('is false for the migrated single account', () => {
    expect(hasMultipleAccounts({ mail: { host: 'x' } })).toBe(false)
  })
  it('is true once a second is configured', () => {
    expect(hasMultipleAccounts({ mail: { accounts: [{ id: 'a' }, { id: 'b' }] } })).toBe(true)
  })
  it('never collides with an existing id', () => {
    expect(nextAccountId([{ id: 'default' }])).toBe('account-1')
    expect(nextAccountId([{ id: 'default' }, { id: 'account-1' }])).toBe('account-2')
  })
})

describe('hasMailAccount', () => {
  it('needs an account with a server and a user', () => {
    expect(hasMailAccount({})).toBe(false)
    expect(hasMailAccount({ mail: { accounts: [] } })).toBe(false)
    expect(hasMailAccount({ mail: { accounts: [{ id: 'a', host: 'imap.x.de', user: '' }] } })).toBe(false)
    expect(hasMailAccount({ mail: { accounts: [{ id: 'a', host: 'imap.x.de', user: 'me@x.de' }] } })).toBe(true)
    expect(hasMailAccount({ mail: { host: 'imap.x.de', user: 'me@x.de' } })).toBe(true) // the pre-accounts shape
  })
})
