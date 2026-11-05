import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('../secrets.js', () => ({ getSecret: () => 'pw' }))

const { listDraftsWith, deleteDraftWith, draftReadyToSend, sendDraftWith, sendDraftsFor, readDraftForEditWith, replaceDraftWith } = await import('../ipc/mailDrafts.js')

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

  it('keeps a PDF Mail placed in the text as an attachment, the thumbnail by its own bytes, and drops what was taken off', async () => {
    const thumb = Buffer.from('thumbpng')
    const pdf = Buffer.from('%PDF-1')
    const doc = Buffer.from('docx')
    const parts = {
      '1': Buffer.from('<html><body><p>Hi</p><img apple-inline="yes" src="cid:PDF-1"><div data-video-link="https://youtu.be/x" data-thumb-asset="t1"><a href="https://youtu.be/x"><img src="cid:asset-t1"></a></div></body></html>'),
      '2': pdf, '3': thumb, '4': doc,
    }
    const appended = []
    const client = {
      getMailboxLock: async () => ({ release: () => {} }),
      fetchOne: async () => ({
        envelope: { from: [{ address: 'me@x' }], to: [{ address: 'a@b' }], subject: 'S' },
        bodyStructure: { type: 'multipart/mixed', childNodes: [
          { part: '1', type: 'text/html' },
          { part: '2', type: 'application/pdf', id: '<PDF-1>', disposition: 'inline', dispositionParameters: { filename: 'rider.pdf' } },
          { part: '3', type: 'image/png', id: '<asset-t1>', disposition: 'inline' },
          { part: '4', type: 'application/msword', disposition: 'attachment', dispositionParameters: { filename: 'info.doc' } },
        ] },
      }),
      download: async (_uid, part) => ({ content: (async function* () { yield parts[part] })() }),
      append: async (box, mime) => { appended.push(mime.toString()); return { uid: 8 } },
      messageDelete: async () => true,
    }
    const d = await readDraftForEditWith(client, 'Drafts', 5)
    expect(d.html).not.toMatch(/PDF-1/)
    expect(d.attachments.map(a => a.filename)).toEqual(['rider.pdf', 'info.doc'])
    // The editor gives the thumbnail back as an app asset (cid:asset-t1): the
    // asset file is gone, the draft's own picture is used.
    await replaceDraftWith(client, { user: 'me@x' }, { mailbox: 'Drafts', uid: 5 },
      { to: 'a@b', subject: 'S', html: '<p>Hi</p><img src="cid:asset-t1">', cids: [{ cid: 'asset-t1', assetId: 't1' }], keepAttachments: [0] },
      () => null)
    const mime = appended[0]
    expect(mime).toMatch(/Content-ID: <asset-t1>/)
    expect(mime).toContain(thumb.toString('base64'))
    expect(mime).toMatch(/filename=rider\.pdf/)
    expect(mime).not.toMatch(/info\.doc/)
  })

  it('reads a draft for editing with its images inline, and replaces it keeping the rest', async () => {
    const png = Buffer.from('fakepng')
    const pdf = Buffer.from('%PDF-1')
    const parts = {
      '1.1': Buffer.from('Hallo'),
      '1.2': Buffer.from('<html><body><p>Hallo <img src="cid:logo@x"></p></body></html>'),
      '2': png,
      '3': pdf,
    }
    const appended = []
    const deleted = []
    const client = {
      getMailboxLock: async () => ({ release: () => {} }),
      fetchOne: async () => ({
        envelope: { from: [{ name: 'Me', address: 'me@x' }], to: [{ address: 'info@moods.ch' }], subject: 'Anfrage', inReplyTo: '<prev@x>' },
        headers: Buffer.from('References: <prev@x>\r\n\r\n'),
        bodyStructure: { type: 'multipart/mixed', childNodes: [
          { type: 'multipart/alternative', childNodes: [{ part: '1.1', type: 'text/plain' }, { part: '1.2', type: 'text/html' }] },
          { part: '2', type: 'image/png', id: '<logo@x>', disposition: 'inline' },
          { part: '3', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'rider.pdf' } },
        ] },
      }),
      download: async (_uid, part) => ({ content: (async function* () { yield parts[part] })() }),
      append: async (box, mime, flags) => { appended.push({ box, mime: mime.toString(), flags }); return { uid: 77 } },
      messageDelete: async uid => { deleted.push(uid); return true },
    }
    const d = await readDraftForEditWith(client, 'Drafts', 5)
    expect(d.html).toBe(`<p>Hallo <img src="data:image/png;base64,${png.toString('base64')}"></p>`)
    expect(d.attachments.map(a => a.filename)).toEqual(['rider.pdf'])
    expect(d.references).toBe('<prev@x>')

    const r = await replaceDraftWith(client, { user: 'me@x' }, { mailbox: 'Drafts', uid: 5 }, { to: 'info@moods.ch', subject: 'Anfrage neu', html: d.html.replace('Hallo', 'Hallo Anna') })
    expect(r).toEqual({ mailbox: 'Drafts', uid: 77 })
    const mime = appended[0].mime
    expect(appended[0].flags).toEqual(['\\Draft', '\\Seen'])
    expect(mime).toMatch(/Subject: Anfrage neu/)
    expect(mime).toMatch(/In-Reply-To: <prev@x>/)
    expect(mime).toMatch(/filename=rider\.pdf/)
    expect(mime).toMatch(/src=3D"cid:|src="cid:/) // the image is an inline part again
    expect(mime).not.toMatch(/data:image\/png/)
    expect(deleted).toEqual(['5'])
  })
})
