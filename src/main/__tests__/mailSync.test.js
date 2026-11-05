import { describe, it, expect, vi } from 'vitest'

// The module registers an IPC handler on import, so electron has to be stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, app: { getPath: () => '/tmp' } }))
vi.mock('imapflow', () => ({ ImapFlow: class {} }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({}) } }))
vi.mock('../secrets.js', () => ({ getSecret: () => 'app-specific' }))

const { isAutoReply } = await import('../ipc/mailSync.js')

describe('isAutoReply', () => {
  it('trusts an Auto-Submitted header', () => {
    expect(isAutoReply({ headers: 'Auto-Submitted: auto-replied\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'Auto-Submitted: auto-generated; owner\r\n' })).toBe(true)
  })

  it('treats "Auto-Submitted: no" as a human message', () => {
    expect(isAutoReply({ headers: 'Auto-Submitted: no\r\n', subject: 'Re: booking' })).toBe(false)
  })

  it('recognises X-Autoreply and X-Autorespond', () => {
    expect(isAutoReply({ headers: 'X-Autoreply: yes\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'X-Autorespond: vacation\r\n' })).toBe(true)
  })

  it('recognises a bulk/auto Precedence', () => {
    expect(isAutoReply({ headers: 'Precedence: auto_reply\r\n' })).toBe(true)
    expect(isAutoReply({ headers: 'Precedence: bulk\r\n' })).toBe(true)
  })

  it('falls back to the subject in English and German', () => {
    expect(isAutoReply({ subject: 'Out of Office: back on Monday' })).toBe(true)
    expect(isAutoReply({ subject: 'Automatische Antwort: Urlaub' })).toBe(true)
    expect(isAutoReply({ subject: 'Abwesenheitsnotiz' })).toBe(true)
    expect(isAutoReply({ subject: 'Re: Automatic reply' })).toBe(true)
  })

  it('leaves an ordinary reply alone', () => {
    expect(isAutoReply({ headers: 'From: a@b.com\r\n', subject: 'Re: Booking request' })).toBe(false)
    expect(isAutoReply({})).toBe(false)
  })

  it('is not fooled by the words appearing mid-subject', () => {
    expect(isAutoReply({ subject: 'We loved your automatic reply demo' })).toBe(false)
  })
})

describe('reading which band an email is about', async () => {
  const { rivalsByAccount, readTextsWith } = await import('../ipc/mailSync.js')
  it('only venues with several bands on one account need it', () => {
    const rows = [
      { _venueId: 'v1', Email: 'a@club.de', Band: 'Alpha', accountId: 'm' },
      { _venueId: 'v1', Email: 'a@club.de', Band: 'Beta', accountId: 'm' },
      { _venueId: 'v2', Email: 'b@club.de', Band: 'Alpha', accountId: 'm' },
      { _venueId: 'v2', Email: 'b@club.de', Band: 'Gamma', accountId: 'n' },
    ]
    const got = rivalsByAccount(rows)
    expect([...got.keys()]).toEqual(['m'])
    expect(got.get('m').get('a@club.de')).toEqual(['Alpha', 'Beta'])
  })
  it('in the inbox, a band’s receive-only account counts as one it reads', () => {
    const rows = [
      { _venueId: 'v2', Email: 'b@club.de', Band: 'Alpha', accountId: 'm' },
      { _venueId: 'v2', Email: 'b@club.de', Band: 'Gamma', accountId: 'n', replyAccountIds: ['n', 'm'] },
    ]
    expect(rivalsByAccount(rows).size).toBe(0)
    const inbox = rivalsByAccount(rows, { reply: true })
    expect([...inbox.keys()]).toEqual(['m'])
    expect(inbox.get('m').get('b@club.de')).toEqual(['Alpha', 'Gamma'])
  })
  it('reads the start of just the emails whose subject names no band', async () => {
    const fetched = []
    const client = {
      getMailboxLock: async () => ({ release: () => {} }),
      async *fetch(uids, query) {
        fetched.push(...uids)
        expect(query.source.maxLength).toBeGreaterThan(0)
        for (const uid of uids) yield { uid, source: Buffer.from('Subject: x\r\n\r\nWir sind Beta.') }
      },
    }
    const msgs = [
      { address: 'a@club.de', subject: 'Alpha 2027', uid: 1 },
      { address: 'a@club.de', subject: 'Anfrage', uid: 2 },
      { address: 'z@other.de', subject: 'Anfrage', uid: 3 },
    ]
    await readTextsWith(client, 'Sent', msgs, new Map([['a@club.de', ['Alpha', 'Beta']]]))
    expect(fetched).toEqual([2])
    expect(msgs[1].text).toMatch(/Beta/)
    expect(msgs[0].text).toBeUndefined()
  })
})
