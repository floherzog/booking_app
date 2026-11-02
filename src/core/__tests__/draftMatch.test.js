import { describe, it, expect } from 'vitest'
import { matchDrafts, draftCounts } from '../draftMatch.js'

const settings = {
  mail: { accounts: [{ id: 'default', host: 'h', user: 'u' }, { id: 'tr', host: 'h2', user: 'u2' }] },
  bands: [{ name: 'Almost Natural' }, { name: 'Trillmann', mailAccountId: 'tr' }],
}
const rows = [
  { _idx: 0, Venue: 'Moods', Email: 'Info <info@moods.ch>', Band: 'Almost Natural' },
  { _idx: 1, Venue: 'Moods', Email: 'info@moods.ch', Band: 'Trillmann' },
  { _idx: 2, Venue: 'Stanzerei', Email: 'mail@stanzerei.at; booking@stanzerei.at', Band: 'Almost Natural' },
]
const d = (uid, to, accountId = 'default', date = '2026-11-01T10:00:00Z') => ({ uid, accountId, mailbox: 'Drafts', to: [{ address: to }], cc: [], date })

describe('drafts matched to venues', () => {
  it('finds a venue by any of its addresses, case aside, and skips strangers', () => {
    const got = matchDrafts([d(1, 'BOOKING@stanzerei.at'), d(2, 'friend@example.com')], rows, settings)
    expect(got.map(m => [m.draft.uid, m.rows.map(r => r._idx)])).toEqual([[1, [2]]])
  })

  it('of a venue’s bands, picks the one whose account holds the draft', () => {
    expect(matchDrafts([d(1, 'info@moods.ch', 'tr')], rows, settings)[0].rows.map(r => r._idx)).toEqual([1])
    expect(matchDrafts([d(1, 'info@moods.ch', 'default')], rows, settings)[0].rows.map(r => r._idx)).toEqual([0])
    expect(matchDrafts([d(1, 'info@moods.ch', 'other')], rows, settings)[0].rows.map(r => r._idx)).toEqual([0, 1])
  })

  it('counts the drafts per row', () => {
    const counts = draftCounts(matchDrafts([d(1, 'mail@stanzerei.at'), d(2, 'booking@stanzerei.at')], rows, settings))
    expect(counts.get(2)).toBe(2)
    expect(counts.has(0)).toBe(false)
  })
})
