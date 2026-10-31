import { describe, it, expect } from 'vitest'
import { bandDateGaps, gapsKey, keepKey, datesSuggestions, agreedDates } from '@core/bandDates'

const bands = [
  { name: 'Trillmann', tourDates: '12. - 20.9.26' },
  { name: 'Room Another', tourDates: '' },
]
const row = (idx, Band, Dates, Venue = `V${idx}`) => ({ _idx: idx, Venue, Band, Dates })

describe('bandDateGaps', () => {
  it('finds empty and differing Dates for bands with touring dates', () => {
    const { missing, mismatch } = bandDateGaps([
      row(0, 'Trillmann', ''),
      row(1, 'Trillmann', '1. - 5.10.26'),
      row(2, 'Trillmann', '12. - 20.9.26'),
    ], bands)
    expect(missing.map(g => g.idx)).toEqual([0])
    expect(mismatch).toEqual([{ idx: 1, venue: 'V1', band: 'Trillmann', have: '1. - 5.10.26', want: '12. - 20.9.26' }])
  })

  it('ignores bands without touring dates, unknown bands and venues without a band', () => {
    const { missing, mismatch } = bandDateGaps([
      row(0, 'Room Another', ''),
      row(1, 'Somebody', ''),
      row(2, '', ''),
    ], bands)
    expect(missing).toEqual([])
    expect(mismatch).toEqual([])
  })

  it('does not count spacing, dash style or case as a difference', () => {
    const { mismatch } = bandDateGaps([
      row(0, 'Trillmann', '12.-20.9.26'),
      row(1, 'Trillmann', ' 12.  –  20.9.26 '),
    ], bands)
    expect(mismatch).toEqual([])
  })
})

describe('gapsKey', () => {
  it('ignores row order and indexes, but not content', () => {
    const a = bandDateGaps([row(0, 'Trillmann', '', 'A'), row(1, 'Trillmann', 'x', 'B')], bands)
    const b = bandDateGaps([row(7, 'Trillmann', 'x', 'B'), row(9, 'Trillmann', '', 'A')], bands)
    const c = bandDateGaps([row(0, 'Trillmann', '', 'A'), row(1, 'Trillmann', 'y', 'B')], bands)
    expect(gapsKey(a)).toBe(gapsKey(b))
    expect(gapsKey(a)).not.toBe(gapsKey(c))
  })
})

describe('keeping a venue on its own dates', () => {
  it('drops a kept mismatch until either side changes', () => {
    const rows = [row(1, 'Trillmann', '1. - 5.10.26')]
    const gap = bandDateGaps(rows, bands).mismatch[0]
    expect(bandDateGaps(rows, bands, [keepKey(gap)]).mismatch).toEqual([])
    expect(bandDateGaps(rows, [{ name: 'Trillmann', tourDates: 'Mai 2027' }], [keepKey(gap)]).mismatch).toHaveLength(1)
  })
})

describe('datesSuggestions', () => {
  const today = new Date(2026, 9, 30)
  const rows = [
    row(0, 'Trillmann', 'Mar - Apr 2027'),
    row(1, 'Trillmann', 'Mar – Apr 2027'),
    row(2, 'Trillmann', 'mar-apr 2027'),
    row(3, 'Trillmann', '1. - 5.10.26'),
    row(4, 'Trillmann', '1. - 5.10.26'),
    row(5, 'Trillmann', 'Spring tour'),
    row(6, 'Trillmann', ''),
    row(7, 'Other', 'Mai 2027'),
  ]

  it('lists each distinct value once with its count, past dates last', () => {
    expect(datesSuggestions(rows, 'Trillmann', today)).toEqual([
      { text: 'Mar - Apr 2027', count: 3, past: false },
      { text: 'Spring tour', count: 1, past: false },
      { text: '1. - 5.10.26', count: 2, past: true },
    ])
  })

  it('fills in a band’s Dates on its own only when its venues agree', () => {
    expect(agreedDates(rows, 'Other')).toBe('Mai 2027')
    expect(agreedDates(rows, 'Trillmann')).toBe('')
    expect(agreedDates(rows, 'Nobody')).toBe('')
  })
})
