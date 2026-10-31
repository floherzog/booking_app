// Mail accounts, and which band sends from which.
//
// The app began with exactly one mailbox, stored as flat fields on `mail`. Bands
// can now each have their own — a different project, a different address, often a
// different provider entirely — so `mail.accounts` is a list and every band may
// name one. Everything here tolerates the old single-account shape, because a
// settings.json written by an earlier version has to keep working untouched.

import { bandName } from './bands.js'
import { plainT } from './tr.js'

export const DEFAULT_ACCOUNT_ID = 'default'

// The host the app shipped as the SMTP default before accounts existed. It was
// written into every settings.json regardless of provider, which silently pointed
// non-iCloud users at Apple's server; see migrateSmtpHost below.
const LEGACY_SMTP_DEFAULT = 'smtp.mail.me.com'

export const ACCOUNT_DEFAULTS = {
  id: DEFAULT_ACCOUNT_ID,
  label: '',
  host: 'imap.mail.me.com',
  port: 993,
  // Empty means "derive it from the IMAP host", which is right far more often
  // than any single hardcoded value.
  smtpHost: '',
  smtpPort: 587,
  user: '',
  fromAddress: '',
  fromName: '',
  draftsMailbox: '',
  sentMailbox: '',
}

// Where this account's password lives in the keychain.
//
// The first account keeps the original un-suffixed key, so upgrading does not
// strand the password someone already stored — and does not make macOS ask for
// keychain access again for an account that never changed.
export function secretKeyFor(accountId) {
  return !accountId || accountId === DEFAULT_ACCOUNT_ID
    ? 'imapPassword'
    : `imapPassword:${accountId}`
}

function isICloudHost(host) {
  return /mail\.me\.com$/i.test(String(host || ''))
}

// An SMTP host of "smtp.mail.me.com" on a non-iCloud account was never a choice
// anyone made — it was the old default being written out unconditionally. Clear
// it so it derives from the IMAP host instead. An iCloud account keeps it,
// because there it is simply correct.
function migrateSmtpHost(smtpHost, host) {
  if (smtpHost === LEGACY_SMTP_DEFAULT && !isICloudHost(host)) return ''
  return smtpHost
}

export function normalizeAccount(raw = {}, fallbackId = DEFAULT_ACCOUNT_ID) {
  const host = String(raw.host ?? ACCOUNT_DEFAULTS.host)
  return {
    ...ACCOUNT_DEFAULTS,
    ...raw,
    id: String(raw.id || fallbackId),
    label: String(raw.label || ''),
    host,
    port: Number(raw.port) || ACCOUNT_DEFAULTS.port,
    smtpHost: migrateSmtpHost(String(raw.smtpHost || ''), host),
    smtpPort: Number(raw.smtpPort) || ACCOUNT_DEFAULTS.smtpPort,
    user: String(raw.user || ''),
    fromAddress: String(raw.fromAddress || ''),
    fromName: String(raw.fromName || ''),
    draftsMailbox: String(raw.draftsMailbox || ''),
    sentMailbox: String(raw.sentMailbox || ''),
  }
}

// `mail` in either shape → a non-empty list of accounts. The first is the default
// one: it is what an unassigned band sends from.
export function normalizeAccounts(mail = {}) {
  const stored = Array.isArray(mail?.accounts) ? mail.accounts.filter(Boolean) : []
  if (stored.length) {
    const seen = new Set()
    return stored.map((a, i) => {
      const account = normalizeAccount(a, i === 0 ? DEFAULT_ACCOUNT_ID : `account-${i}`)
      // Ids address keychain entries, so a duplicate would make two accounts
      // share one password.
      let id = account.id
      let n = 2
      while (seen.has(id)) id = `${account.id}-${n++}`
      seen.add(id)
      return { ...account, id }
    })
  }
  // The pre-accounts shape: the flat fields are the one and only account.
  return [normalizeAccount(mail, DEFAULT_ACCOUNT_ID)]
}

// Whether any mailbox has been set up at all: an account with a server and a
// user name. (The password lives in the keychain and isn't known here.)
export function hasMailAccount(settings) {
  return normalizeAccounts(settings?.mail || {}).some(a => a.host.trim() && a.user.trim())
}

export function accountById(accounts, id) {
  const list = accounts || []
  return list.find(a => a.id === id) || list[0] || normalizeAccount({})
}

// Which account a band sends from. An unassigned band — and any band not in the
// managed list at all — uses the first account.
export function accountIdForBand(bands, name) {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted) return DEFAULT_ACCOUNT_ID
  const match = (bands || []).find(b => bandName(b).trim().toLowerCase() === wanted)
  return match?.mailAccountId || DEFAULT_ACCOUNT_ID
}

// The account a venue row's mail should go out from.
export function accountForRow(row, settings) {
  const accounts = normalizeAccounts(settings?.mail)
  return accountById(accounts, accountIdForBand(settings?.bands, row?.['Band']))
}

// What to call an account in the UI.
export function accountLabel(account, t = plainT) {
  if (!account) return ''
  return account.label || account.fromAddress || account.user || t('Unnamed account')
}

export function hasMultipleAccounts(settings) {
  return normalizeAccounts(settings?.mail).length > 1
}

// A fresh account id that does not collide with the existing ones.
export function nextAccountId(accounts = []) {
  const taken = new Set(accounts.map(a => a?.id))
  let n = accounts.length || 1
  let id = `account-${n}`
  while (taken.has(id)) id = `account-${++n}`
  return id
}

// An SMTP host worked out from the IMAP one. Right for the common providers
// (imap.gmail.com → smtp.gmail.com, iCloud's oddly-named pair), and harmless
// where it is wrong because the field can always be filled in by hand.
export function defaultSmtpHost(imapHost) {
  const h = String(imapHost || '')
  if (/mail\.me\.com$/i.test(h)) return 'smtp.mail.me.com'
  return h.replace(/^imap\./i, 'smtp.')
}
