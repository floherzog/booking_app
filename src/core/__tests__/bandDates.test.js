import { describe, it, expect } from 'vitest'
import { bandDateGaps, gapsKey } from '@core/bandDates'

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
