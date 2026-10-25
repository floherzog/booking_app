import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The module registers IPC handlers on import, so electron has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))

const { resolveDraftsMailbox, resolveSentMailbox, friendlyMailError, testConnectionWith, appendDraftWith } =
  await import('../ipc/mailImap.js')

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let dir
let assetFile

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'booking-imap-'))
  assetFile = join(dir, 'press.png')
  writeFileSync(assetFile, PNG)
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// A stand-in for ImapFlow that records what the code would have sent.
function fakeClient(mailboxes) {
  const calls = []
  return {
    calls,
    list: async () => mailboxes,
    append: async (mailbox, content, flags) => {
      calls.push({ mailbox, content, flags })
      return { uid: 42 }
    },
  }
}

const ICLOUD_MAILBOXES = [
  { path: 'INBOX', specialUse: '' },
  { path: 'Sent Messages', specialUse: '\\Sent' },
  { path: 'Entwürfe', specialUse: '\\Drafts' },
  { path: 'Archive', specialUse: '\\Archive' },
]

const SETTINGS = {
  // These take one mail account now, not the whole settings object.
  id: 'default', host: 'imap.example.com', port: 993, user: 'me@example.com',
  fromAddress: 'me@example.com', fromName: 'Flo', draftsMailbox: '',
}

describe('resolveDraftsMailbox', () => {
  it('prefers what the user configured', () => {
    expect(resolveDraftsMailbox(ICLOUD_MAILBOXES, 'My Drafts')).toBe('My Drafts')
  })

  it('otherwise uses the SPECIAL-USE \\Drafts mailbox, whatever it is called', () => {
    expect(resolveDraftsMailbox(ICLOUD_MAILBOXES, '')).toBe('Entwürfe')
  })

  it('falls back to a mailbox literally named Drafts', () => {
    const boxes = [{ path: 'INBOX', specialUse: '' }, { path: 'Drafts', specialUse: '' }]
    expect(resolveDraftsMailbox(boxes, '')).toBe('Drafts')
  })

  it('falls back to the conventional name when nothing matches', () => {
    expect(resolveDraftsMailbox([{ path: 'INBOX', specialUse: '' }], '')).toBe('Drafts')
    expect(resolveDraftsMailbox([], '')).toBe('Drafts')
  })
})

describe('mailboxes on servers without SPECIAL-USE', () => {
  // cPanel/Plesk-style hosting: everything nested under INBOX, no flags.
  const HOSTED = [
    { path: 'INBOX', specialUse: '' },
    { path: 'INBOX.Drafts', specialUse: '' },
    { path: 'INBOX.Sent', specialUse: '' },
    { path: 'INBOX.Trash', specialUse: '' },
  ]
  const GERMAN = [
    { path: 'INBOX', specialUse: '' },
    { path: 'Entwürfe', specialUse: '' },
    { path: 'Gesendete Objekte', specialUse: '' },
  ]

  it('finds Sent and Drafts nested under INBOX', () => {
    expect(resolveSentMailbox(HOSTED, '')).toBe('INBOX.Sent')
    expect(resolveDraftsMailbox(HOSTED, '')).toBe('INBOX.Drafts')
    expect(resolveSentMailbox([{ path: 'INBOX/Sent Items', specialUse: '' }], '')).toBe('INBOX/Sent Items')
  })

  it('finds the German names', () => {
    expect(resolveSentMailbox(GERMAN, '')).toBe('Gesendete Objekte')
    expect(resolveDraftsMailbox(GERMAN, '')).toBe('Entwürfe')
  })

  it('still prefers SPECIAL-USE and what the user configured', () => {
    expect(resolveSentMailbox(ICLOUD_MAILBOXES, '')).toBe('Sent Messages')
    expect(resolveSentMailbox(HOSTED, 'INBOX.Gesendet')).toBe('INBOX.Gesendet')
  })

  it('suggests a Sent mailbox only when the server really has one', async () => {
    expect((await testConnectionWith(fakeClient(HOSTED), SETTINGS)).sentSuggestion).toBe('INBOX.Sent')
    expect((await testConnectionWith(fakeClient([{ path: 'INBOX', specialUse: '' }]), SETTINGS)).sentSuggestion).toBe('')
  })
})

describe('friendlyMailError', () => {
  it('explains an iCloud authentication failure and links the right page', () => {
    const msg = friendlyMailError({ responseText: 'NO [AUTHENTICATIONFAILED] Authentication failed' }, { host: 'imap.mail.me.com' })
    expect(msg).toMatch(/app-specific password/i)
    expect(msg).toContain('https://appleid.apple.com')
    expect(msg).not.toContain('AUTHENTICATIONFAILED')
  })

  it('gives Gmail its own app-password advice, for IMAP and SMTP rejections alike', () => {
    const gmail = { host: 'imap.gmail.com', user: 'someone@gmail.com' }
    for (const e of [
      { responseText: 'NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)' },
      Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted.'), { code: 'EAUTH' }),
    ]) {
      const msg = friendlyMailError(e, gmail)
      expect(msg).toContain('https://myaccount.google.com/apppasswords')
      expect(msg).toMatch(/2-Step Verification/)
      expect(msg).not.toMatch(/iCloud/)
    }
  })

  it('falls back to general advice for a rejected login on another provider', () => {
    const msg = friendlyMailError({ responseText: 'NO LOGIN failed' }, { host: 'imap.example.net' })
    expect(msg).toMatch(/rejected that username and password/)
    expect(msg).not.toContain('appleid')
  })

  it('explains the common connection failures', () => {
    expect(friendlyMailError(new Error('getaddrinfo ENOTFOUND imap.bogus'))).toMatch(/could not find/i)
    expect(friendlyMailError(new Error('connect ECONNREFUSED'))).toMatch(/refused/i)
    expect(friendlyMailError(new Error('Socket timeout ETIMEDOUT'))).toMatch(/did not respond/i)
  })

  it('passes an unrecognised error through rather than swallowing it', () => {
    expect(friendlyMailError(new Error('Something odd'))).toBe('Something odd')
  })
})

describe('testConnectionWith', () => {
  it('returns the mailboxes and preselects SPECIAL-USE Drafts', async () => {
    const r = await testConnectionWith(fakeClient(ICLOUD_MAILBOXES), SETTINGS)
    expect(r.suggestion).toBe('Entwürfe')
    expect(r.mailboxes).toContainEqual({ path: 'Sent Messages', specialUse: '\\Sent' })
  })

  it('keeps a mailbox the user already chose', async () => {
    const r = await testConnectionWith(fakeClient(ICLOUD_MAILBOXES), { draftsMailbox: 'INBOX/Drafts' })
    expect(r.suggestion).toBe('INBOX/Drafts')
  })
})

describe('appendDraftWith', () => {
  const payload = {
    to: 'venue@example.com',
    subject: 'Anfrage Club X',
    html: '<!doctype html><html><body><p>Hallo <strong>Anna</strong></p></body></html>',
    cids: [],
  }

  it('appends to the resolved mailbox with the \\Draft and \\Seen flags', async () => {
    const client = fakeClient(ICLOUD_MAILBOXES)
    const r = await appendDraftWith(client, SETTINGS, payload)

    expect(client.calls).toHaveLength(1)
    const call = client.calls[0]
    expect(call.mailbox).toBe('Entwürfe')
    // Without \Draft, Mail.app shows the message as received mail.
    expect(call.flags).toEqual(['\\Draft', '\\Seen'])
    expect(r).toEqual({ mailbox: 'Entwürfe', uid: 42 })
  })

  it('appends a real RFC822 message, not a JSON blob', async () => {
    const client = fakeClient(ICLOUD_MAILBOXES)
    await appendDraftWith(client, SETTINGS, payload)
    const raw = client.calls[0].content

    expect(Buffer.isBuffer(raw)).toBe(true)
    const s = raw.toString('utf8')
    // The literal an IMAP APPEND sends: headers, blank line, body — CRLF throughout.
    expect(s).toMatch(/^From: Flo <me@example\.com>\r\n/)
    expect(s).toContain('To: venue@example.com\r\n')
    expect(s).toContain('Subject: Anfrage Club X\r\n')
    expect(s).toContain('MIME-Version: 1.0\r\n')
    expect(s).toContain('\r\n\r\n')
    // A plain-text alternative is derived from the html.
    expect(s).toContain('Hallo Anna')
  })

  it('resolves cids to asset paths and embeds them inline', async () => {
    const client = fakeClient(ICLOUD_MAILBOXES)
    await appendDraftWith(
      client,
      SETTINGS,
      {
        ...payload,
        html: '<!doctype html><html><body><img src="cid:asset-press.png"></body></html>',
        cids: [{ cid: 'asset-press.png', assetId: 'press.png' }],
      },
      assetId => (assetId === 'press.png' ? assetFile : null),
    )

    const s = client.calls[0].content.toString('utf8')
    expect(s).toContain('multipart/related')
    expect(s).toContain('Content-ID: <asset-press.png>')
    expect(s).toMatch(/Content-Disposition: inline/)
    expect(s).toContain(PNG.toString('base64').slice(0, 24))
  })

  it('skips a cid whose asset file has gone missing rather than failing the draft', async () => {
    const client = fakeClient(ICLOUD_MAILBOXES)
    await appendDraftWith(
      client,
      SETTINGS,
      { ...payload, cids: [{ cid: 'asset-gone.png', assetId: 'gone.png' }] },
      () => null,
    )
    const s = client.calls[0].content.toString('utf8')
    expect(s).not.toContain('Content-ID:')
    expect(s).toContain('To: venue@example.com')
  })

  it('falls back to the IMAP user when no from address is set', async () => {
    const client = fakeClient(ICLOUD_MAILBOXES)
    await appendDraftWith(client, { id: 'default', user: 'me@example.com' }, payload)
    expect(client.calls[0].content.toString('utf8')).toContain('From: me@example.com')
  })

  it('never writes anything back to the venue row', async () => {
    // appendDraftWith takes a payload, not a row — there is no path by which it
    // could touch 'Last emailed'. Asserted so a future refactor cannot add one.
    const client = fakeClient(ICLOUD_MAILBOXES)
    const r = await appendDraftWith(client, SETTINGS, payload)
    expect(Object.keys(r)).toEqual(['mailbox', 'uid'])
  })
})
