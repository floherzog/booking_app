import { describe, it, expect } from 'vitest'
import { datesForVenue, weekdaysIn, dateRangesIn } from '@core/venueDates'
import { substitutePlaceholders } from '@core/templates'

const TOUR = '12. - 20.6.27; 13. - 17.10.27 & 30.3. - 9.4.28'

describe('weekdaysIn', () => {
  it('reads full names, plurals, German adverbs and abbreviations', () => {
    expect([...weekdaysIn('Wednesdays').include]).toEqual([3])
    expect([...weekdaysIn('dienstags').include]).toEqual([2])
    expect([...weekdaysIn('Fridays (occasionally Sat)').include]).toEqual([5, 6])
    expect([...weekdaysIn('meist Mi/Do/Fr 20:30').include]).toEqual([3, 4, 5])
  })
  it('spans ranges and reads "no Sundays" as an exclusion', () => {
    expect([...weekdaysIn('Mi-Fr').include]).toEqual([3, 4, 5])
    const r = weekdaysIn('2 months ahead, no Sundays')
    expect(r.include.size).toBe(0)
    expect([...r.exclude]).toEqual([0])
  })
  it('ignores two-letter words standing alone', () => {
    expect(weekdaysIn('so far so good').include.size).toBe(0)
    expect(weekdaysIn('Monat Mai').include.size).toBe(0)
  })
})

describe('dateRangesIn', () => {
  it('reads ranges with the month and year only at the end', () => {
    expect(dateRangesIn('30.3. - 9.4.28')).toEqual([{ start: { d: 30, m: 3, y: 2028 }, end: { d: 9, m: 4, y: 2028 } }])
    expect(dateRangesIn('24.–27.09.2026')[0].start).toEqual({ d: 24, m: 9, y: 2026 })
    expect(dateRangesIn('Donnerstag 18:00')).toEqual([])
  })
})

describe('datesForVenue', () => {
  it('keeps only the weekdays the venue plays', () => {
    expect(datesForVenue(TOUR, 'Wednesdays')).toEqual({ text: '16.6.27, 13.10.27 & 5.4.28', narrowed: true })
    expect(datesForVenue(TOUR, 'meist Mi/Do/Fr').text).toBe('16. - 18.6.27, 13. - 15.10.27, 30. - 31.3.28 & 5. - 7.4.28')
  })
  it('keeps only the days in the venue’s own dates', () => {
    expect(datesForVenue(TOUR, '14.6.').text).toBe('14.6.27')
    expect(datesForVenue(TOUR, '15. - 18.10.27').text).toBe('15. - 17.10.27')
  })
  it('leaves the Dates as written when the Time Frame says nothing usable or nothing fits', () => {
    for (const tf of ['', 'September', 'Die letzte Spielzeit war ausgebucht', '24.–27.09.2026']) {
      expect(datesForVenue(TOUR, tf)).toEqual({ text: TOUR, narrowed: false })
    }
    expect(datesForVenue('Juni 2027', 'Fridays').narrowed).toBe(false)
    expect(datesForVenue('16.6.27', 'Wednesdays').narrowed).toBe(false)
  })
  it('fills {{dates}}', () => {
    const row = { Dates: TOUR, 'Time Frame': 'dienstags' }
    expect(substitutePlaceholders('am {{dates}}', row).text).toBe('am 15.6.27 & 4.4.28')
  })
})
