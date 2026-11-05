import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))
vi.mock('../secrets.js', () => ({ getSecret: () => 'pw' }))

const { listDraftsWith, deleteDraftWith, draftReadyToSend, sendDraftWith, sendDraftsFor } = await import('../ipc/mailDrafts.js')

describe('drafts in the Drafts mailbox', () => {
  it('lists the drafts that aren’t deleted, from the account’s Drafts mailbox', async () => {
    const client = {
      list: async () => [{ path: 'INBOX' }, { path: 'Entwürfe', specialUse: '\\Drafts' }],
      getMailboxLock: vi.fn(async () => ({ release: () => {} })),
      search: vi.fn(async () => [4]),
      async *fetch() {
        yield { uid: 4, envelope: { date: '2026-11-01T10:00:00Z', to: [{ name: 'Moods', address: 'info@moods.ch' }], subject: 'Anfrage', messageId: '<d@x>' } }
      },
    }
    const got = await listDraftsWith(client, { id: 'a1' })
    expect(client.getMailboxLock).toHaveBeenCalledWith('Entwürfe')
    expect(client.search).toHaveBeenCalledWith({ deleted: false }, { uid: true })
    expect(got).toEqual([{ accountId: 'a1', mailbox: 'Entwürfe', uid: 4, date: '2026-11-01T10:00:00.000Z', to: [{ name: 'Moods', address: 'info@moods.ch' }], cc: [], subject: 'Anfrage', messageId: '<d@x>' }])
  })

  it('lists nothing when the account has no Drafts mailbox', async () => {
    const client = { list: async () => [{ path: 'INBOX' }], getMailboxLock: vi.fn() }
    expect(await listDraftsWith(client, { id: 'a1' })).toEqual([])
    expect(client.getMailboxLock).not.toHaveBeenCalled()
  })

  it('deletes for good, by UID', async () => {
    const client = { getMailboxLock: async () => ({ release: () => {} }), messageDelete: vi.fn(async () => true) }
    expect(await deleteDraftWith(client, 'Drafts', 9)).toEqual({ ok: true })
    expect(client.messageDelete).toHaveBeenCalledWith('9', { uid: true })
  })

  it('drops the draft-only headers and dates the message now, body untouched', () => {
    const raw = 'From: me@x\r\nTo: info@moods.ch\r\nDate: Sat, 1 Nov 2026 10:00:00 +0000\r\nX-Uniform-Type-Identifier: com.apple.mail-draft\r\nX-Apple-Mail-Remote-Attachments: NO\r\nSubject: Anfrage\r\n  zweite Zeile\r\n\r\nHallo ü\r\nDate: stays in the body\r\n'
    const out = draftReadyToSend(Buffer.from(raw, 'utf8'), new Date('2026-11-02T08:00:00Z')).toString('utf8')
    expect(out).not.toMatch(/X-Uniform|X-Apple/)
    expect(out).toContain('Subject: Anfrage\r\n  zweite Zeile\r\n')
    expect(out).toContain('Date: Mon, 02 Nov 2026 08:00:00 +0000\r\n\r\nHallo ü\r\nDate: stays in the body')
    expect(out.match(/^Date:/gm)).toHaveLength(2) // the new one, and the line in the body
  })

  it('sends a draft as it is, files it in Sent, then takes it out of Drafts', async () => {
    const steps = []
    const transport = { sendMail: vi.fn(async () => { steps.push('send'); return { accepted: ['info@moods.ch'] } }) }
    const r = await sendDraftWith({
      account: { id: 'a1', user: 'me@x' },
      transport,
      fetchDraft: async () => ({ raw: Buffer.from('To: info@moods.ch\r\n\r\nHi'), recipients: ['info@moods.ch'] }),
      fileToSent: async () => { steps.push('sent') },
      deleteDraft: async () => { steps.push('delete') },
    })
    expect(steps).toEqual(['send', 'sent', 'delete'])
    expect(transport.sendMail.mock.calls[0][0].envelope).toEqual({ from: 'me@x', to: ['info@moods.ch'] })
    expect(r).toEqual({ accepted: ['info@moods.ch'], filed: true, removed: true })
  })

  it('does not send a draft without a recipient', async () => {
    const transport = { sendMail: vi.fn() }
    await expect(sendDraftWith({ account: {}, transport, fetchDraft: async () => ({ raw: Buffer.from(''), recipients: [] }) }))
      .rejects.toThrow('no recipient')
    expect(transport.sendMail).not.toHaveBeenCalled()
  })

  it('sends several drafts with two logins, side by side, and reports each', async () => {
    const logins = vi.fn()
    const appended = []
    const deleted = []
    const client = {
      list: async () => [{ path: 'Drafts', specialUse: '\\Drafts' }, { path: 'Sent', specialUse: '\\Sent' }],
      getMailboxLock: async () => ({ release: () => {} }),
      fetchOne: async uid => ({ envelope: { to: uid === '3' ? [] : [{ address: `v${uid}@x` }] } }),
      download: async () => ({ content: (async function* () { yield Buffer.from('Subject: Hi\r\n\r\nBody') })() }),
      append: async (box, mime) => { appended.push(box) },
      messageDelete: async uid => { deleted.push(uid); return true },
    }
    const withClient = async fn => { logins(); return fn(client) }
    let inFlight = 0
    let most = 0
    const transport = {
      sendMail: vi.fn(async ({ envelope }) => {
        inFlight += 1; most = Math.max(most, inFlight)
        await new Promise(r => setTimeout(r, 5))
        inFlight -= 1
        if (envelope.to[0] === 'v2@x') throw new Error('rejected')
        return { accepted: envelope.to }
      }),
    }
    const refs = [1, 2, 3, 4].map(uid => ({ accountId: 'a', mailbox: 'Drafts', uid }))
    const got = await sendDraftsFor({ id: 'a', user: 'me@x' }, refs, { withClient, transport })
    expect(logins).toHaveBeenCalledTimes(2)
    expect(most).toBeGreaterThan(1)
    expect(got.map(r => r.uid)).toEqual([1, 2, 3, 4])
    expect(got[0]).toMatchObject({ accepted: ['v1@x'], filed: true, removed: true })
    expect(got[1].error).toMatch(/rejected/)
    expect(got[2].error).toMatch(/no recipient/)
    expect(got[3]).toMatchObject({ filed: true, removed: true })
    expect(appended).toEqual(['Sent', 'Sent'])
    expect(deleted).toEqual(['1', '4'])
  })
})
