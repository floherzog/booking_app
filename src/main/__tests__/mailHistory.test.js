import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'node:stream'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))
vi.mock('../secrets.js', () => ({ getSecret: () => 'pw' }))

const { venueAddresses, listWith, mergeHistory, pickPart, readWith } = await import('../ipc/mailHistory.js')

function fakeClient(boxes) {
  return {
    list: async () => [{ path: 'INBOX' }, { path: 'Sent Messages', specialUse: '\\Sent' }],
    getMailboxLock: async path => { if (!boxes[path]) throw new Error('no box'); return { release: () => {} } },
    search: vi.fn(async () => [1, 2]),
    async *fetch(_uids, _opts) { for (const m of boxes[this.current] || []) yield m },
  }
}

describe('mail history', () => {
  it('reads the addresses in an Email cell', () => {
    expect(venueAddresses('Info <Info@Venue.de>; booking@venue.de, info@venue.de')).toEqual(['info@venue.de', 'booking@venue.de'])
    expect(venueAddresses('—')).toEqual([])
  })

  it('lists what came from the venue and what went to it, auto-replies marked', async () => {
    const inbox = [{ uid: 7, envelope: { date: '2026-10-02T10:00:00Z', from: [{ address: 'info@venue.de' }], subject: 'Re: Anfrage', messageId: '<a@x>' }, headers: Buffer.from('') },
      { uid: 8, envelope: { date: '2026-10-03T10:00:00Z', from: [{ address: 'info@venue.de' }], subject: 'Abwesenheitsnotiz', messageId: '<b@x>' }, headers: Buffer.from('Auto-Submitted: auto-replied\r\n') }]
    const sent = [{ uid: 3, envelope: { date: '2026-10-01T10:00:00Z', from: [{ address: 'me@x' }], to: [{ address: 'info@venue.de' }], subject: 'Anfrage', messageId: '<c@x>' } }]
    const client = fakeClient({ INBOX: inbox, 'Sent Messages': sent })
    const lock = client.getMailboxLock
    client.getMailboxLock = async p => { client.current = p; return lock(p) }
    const got = await listWith(client, { id: 'a1' }, ['info@venue.de'])
    expect(client.search).toHaveBeenCalledWith({ from: 'info@venue.de' }, { uid: true })
    expect(client.search).toHaveBeenCalledWith({ or: [{ to: 'info@venue.de' }, { cc: 'info@venue.de' }] }, { uid: true })
    const merged = mergeHistory([got])
    expect(merged.map(m => [m.subject, m.direction, m.auto])).toEqual([
      ['Abwesenheitsnotiz', 'in', true], ['Re: Anfrage', 'in', false], ['Anfrage', 'out', false],
    ])
  })

  it('shows the same message once, even from two accounts', () => {
    const m = { messageId: '<a@x>', direction: 'in', date: '2026-10-02T10:00:00Z' }
    expect(mergeHistory([[{ ...m, accountId: 'a' }], [{ ...m, accountId: 'b' }]])).toHaveLength(1)
  })

  it('prefers the HTML part, never an attachment', () => {
    const tree = { childNodes: [
      { type: 'text/plain', part: '1' },
      { childNodes: [{ type: 'text/html', part: '2.1' }, { type: 'text/html', part: '2.2', disposition: 'attachment' }] },
    ] }
    expect(pickPart(tree)).toEqual({ part: '2.1', type: 'html' })
    expect(pickPart({ type: 'text/plain' })).toEqual({ part: '1', type: 'text' })
    expect(pickPart({ type: 'application/pdf', disposition: 'attachment' })).toBe(null)
  })

  it('reads one message', async () => {
    const client = {
      getMailboxLock: async () => ({ release: () => {} }),
      fetchOne: async () => ({ envelope: { from: [{ name: 'Anna', address: 'info@venue.de' }], subject: 'Re: Anfrage', messageId: '<a@x>' }, bodyStructure: { type: 'text/plain' } }),
      download: async () => ({ content: Readable.from([Buffer.from('Liebe Grüße')]) }),
    }
    expect(await readWith(client, 'INBOX', 7)).toMatchObject({ from: { name: 'Anna' }, subject: 'Re: Anfrage', text: 'Liebe Grüße' })
  })
})
