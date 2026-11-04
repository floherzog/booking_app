import { describe, it, expect } from 'vitest'
import { normalizeAddress, latestByAddress, buildSyncEdits, buildMultiBandSyncEdits, scanSince } from '../mailSync.js'

const row = (_idx, Email, extra = {}) => ({ _idx, Email, 'Last emailed': '', Status: '', ...extra })
const d = (y, m, day) => new Date(y, m - 1, day)

describe('normalizeAddress', () => {
  it('pulls the address out of a display-name form', () => {
    expect(normalizeAddress('Anna Müller <A.Mueller@Venue.DE>')).toBe('a.mueller@venue.de')
  })
  it('lowercases and trims a bare address', () => {
    expect(normalizeAddress('  BOOKING@Club.com ')).toBe('booking@club.com')
  })
  it('returns empty for nothing', () => {
    expect(normalizeAddress('')).toBe('')
    expect(normalizeAddress(null)).toBe('')
  })
})

describe('latestByAddress', () => {
  it('keeps only the newest message per address', () => {
    const map = latestByAddress([
      { address: 'a@b.com', date: d(2026, 1, 5) },
      { address: 'A@B.com', date: d(2026, 3, 9) },
      { address: 'a@b.com', date: d(2025, 11, 1) },
    ])
    expect(map.size).toBe(1)
    expect(map.get('a@b.com').date).toEqual(d(2026, 3, 9))
  })

  it('drops entries with no address or an unparseable date', () => {
    const map = latestByAddress([
      { address: '', date: d(2026, 1, 1) },
      { address: 'x@y.com', date: 'not a date' },
    ])
    expect(map.size).toBe(0)
  })

  it('carries the auto-reply flag', () => {
    const map = latestByAddress([{ address: 'a@b.com', date: d(2026, 2, 2), autoReply: true }])
    expect(map.get('a@b.com').autoReply).toBe(true)
  })
})

describe('buildSyncEdits — Last emailed', () => {
  const sent = latestByAddress([{ address: 'a@b.com', date: d(2026, 3, 9) }])

  it('fills an empty cell', () => {
    const edits = buildSyncEdits([row(0, 'a@b.com')], { sent })
    expect(edits).toEqual([{ _idx: 0, field: 'Last emailed', value: '09.03.26', before: '' }])
  })

  it('moves an older date forward', () => {
    const edits = buildSyncEdits([row(0, 'a@b.com', { 'Last emailed': '01.01.26' })], { sent })
    expect(edits[0].value).toBe('09.03.26')
  })

  it('never rewinds a newer date already in the CSV', () => {
    const edits = buildSyncEdits([row(0, 'a@b.com', { 'Last emailed': '01.06.26' })], { sent })
    expect(edits).toEqual([])
  })

  it('leaves a same-day date alone', () => {
    const edits = buildSyncEdits([row(0, 'a@b.com', { 'Last emailed': '09.03.26' })], { sent })
    expect(edits).toEqual([])
  })

  it('ignores a row with no email address', () => {
    expect(buildSyncEdits([row(0, '')], { sent })).toEqual([])
  })

  it('ignores a row no message matches', () => {
    expect(buildSyncEdits([row(0, 'nobody@else.com')], { sent })).toEqual([])
  })

  it('does nothing when the mode is not imap', () => {
    const edits = buildSyncEdits([row(0, 'a@b.com')], { sent }, { lastEmailed: 'onSend', repliesMode: 'off' })
    expect(edits).toEqual([])
  })
})

describe('buildSyncEdits — replies', () => {
  it('records a real reply with its date', () => {
    const replies = latestByAddress([{ address: 'a@b.com', date: d(2026, 4, 1) }])
    const edits = buildSyncEdits([row(0, 'a@b.com')], { replies }, { lastEmailed: 'off' })
    expect(edits).toEqual([{ _idx: 0, field: 'Status', value: 'reply: 01.04.26', before: '' }])
  })

  it('marks an auto-responder as auto-reply', () => {
    const replies = latestByAddress([{ address: 'a@b.com', date: d(2026, 4, 1), autoReply: true }])
    const edits = buildSyncEdits([row(0, 'a@b.com')], { replies }, { lastEmailed: 'off' })
    expect(edits[0].value).toBe('auto-reply: 01.04.26')
  })

  it('upgrades a recorded auto-reply to a real reply even when older', () => {
    const replies = latestByAddress([{ address: 'a@b.com', date: d(2026, 1, 1) }])
    const rows = [row(0, 'a@b.com', { Status: 'auto-reply: 01.05.26' })]
    const edits = buildSyncEdits(rows, { replies }, { lastEmailed: 'off' })
    expect(edits[0].value).toBe('reply: 01.01.26')
  })

  it('does not downgrade a real reply to an auto-reply', () => {
    const replies = latestByAddress([{ address: 'a@b.com', date: d(2026, 1, 1), autoReply: true }])
    const rows = [row(0, 'a@b.com', { Status: 'reply: 01.05.26' })]
    expect(buildSyncEdits(rows, { replies }, { lastEmailed: 'off' })).toEqual([])
  })

  it('does nothing when replies sync is off', () => {
    const replies = latestByAddress([{ address: 'a@b.com', date: d(2026, 4, 1) }])
    const edits = buildSyncEdits([row(0, 'a@b.com')], { replies }, { lastEmailed: 'off', repliesMode: 'off' })
    expect(edits).toEqual([])
  })
})

describe('scanSince', () => {
  it('goes back the configured number of months', () => {
    expect(scanSince(12, d(2026, 9, 11))).toEqual(d(2025, 9, 11))
  })
  it('falls back to 24 months for nonsense', () => {
    expect(scanSince(0, d(2026, 9, 11))).toEqual(d(2024, 9, 11))
    expect(scanSince('x', d(2026, 9, 11))).toEqual(d(2024, 9, 11))
  })
  it('caps absurd windows at 20 years', () => {
    expect(scanSince(9999, d(2026, 9, 11))).toEqual(d(2006, 9, 11))
  })
})

describe('buildMultiBandSyncEdits', () => {
  const entry = (_idx, Band, accountId, extra = {}) =>
    ({ _idx, _venueId: 'v1', Email: 'club@venue.de', Band, accountId, 'Last emailed': '', Status: '', ...extra })
  const sent = (accountId, subject, date) => ({ address: 'club@venue.de', date, subject, accountId })

  it('only counts mail from the band’s own account', () => {
    const rows = [entry(0, 'Alpha', 'a'), entry(1, 'Beta', 'b')]
    const edits = buildMultiBandSyncEdits(rows, { sent: [sent('a', 'Anfrage', d(2026, 5, 1))] }, { repliesMode: 'off' })
    expect(edits).toEqual([{ _idx: 0, field: 'Last emailed', value: '01.05.26', before: '' }])
  })

  it('tells bands on a shared account apart by the band named in the subject', () => {
    const rows = [entry(0, 'Alpha', 'a'), entry(1, 'Beta', 'a')]
    const edits = buildMultiBandSyncEdits(rows, {
      sent: [sent('a', 'Booking request: Beta', d(2026, 5, 1)), sent('a', 'Alpha tour 2027', d(2026, 4, 1))],
    }, { repliesMode: 'off' })
    expect(edits).toContainEqual({ _idx: 0, field: 'Last emailed', value: '01.04.26', before: '' })
    expect(edits).toContainEqual({ _idx: 1, field: 'Last emailed', value: '01.05.26', before: '' })
  })

  it('counts a message naming no band (or both) for every band on that account', () => {
    const rows = [entry(0, 'Alpha', 'a'), entry(1, 'Beta', 'a')]
    const edits = buildMultiBandSyncEdits(rows, {
      replies: [{ address: 'club@venue.de', date: d(2026, 6, 2), subject: 'Re: Anfrage', accountId: 'a', autoReply: false }],
    }, { lastEmailed: 'off' })
    expect(edits.map(e => e._idx).sort()).toEqual([0, 1])
    expect(edits.every(e => e.field === 'Status')).toBe(true)
  })
})

describe('linked venues and accounts', async () => {
  const { buildMultiBandSyncEdits: build } = await import('@core/mailSync')
  it('a venue with one line counts mail from every account', () => {
    const rows = [{ _idx: 0, _venueId: 'v0', Email: 'a@club.de', Band: 'Juno', accountId: 'one', 'Last emailed': '' }]
    const sent = [{ address: 'a@club.de', date: new Date(2026, 9, 1), accountId: 'two', subject: 'Anfrage' }]
    expect(build(rows, { sent, replies: [] }).map(e => e.value)).toEqual(['01.10.26'])
  })
  it('a venue with several bands only counts each band’s own account', () => {
    const rows = [
      { _idx: 0, _venueId: 'v0', Email: 'a@club.de', Band: 'Juno', accountId: 'one', 'Last emailed': '' },
      { _idx: 1, _venueId: 'v0', Email: 'a@club.de', Band: 'Trio', accountId: 'two', 'Last emailed': '' },
    ]
    const sent = [{ address: 'a@club.de', date: new Date(2026, 9, 1), accountId: 'two', subject: 'Anfrage' }]
    expect(build(rows, { sent, replies: [] }).map(e => e._idx)).toEqual([1])
  })
})
