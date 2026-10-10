import { describe, it, expect } from 'vitest'
import { parseDate, formatDateDDMMYY, toInputValue, fromInputValue, parseMonthsFromTimeFrame, normalizeDateText, displayDateText } from '@core/parseDate'

function ymd(d) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
}

describe('parseDate', () => {
  it("reads the app's own dd.MM.yy format", () => {
    expect(ymd(parseDate('15.03.24'))).toEqual([2024, 3, 15])
  })

  it('reads a German month name', () => {
    expect(ymd(parseDate('Juni 2027'))).toEqual([2027, 6, 1])
  })

  it('reads an English month name', () => {
    expect(ymd(parseDate('March 2025'))).toEqual([2025, 3, 1])
  })

  it('reads a bare year', () => {
    expect(ymd(parseDate('2025'))).toEqual([2025, 1, 1])
  })

  it('reads ISO', () => {
    expect(ymd(parseDate('2025-03-15'))).toEqual([2025, 3, 15])
  })

  it('reads a full ISO timestamp, keeping the time of day', () => {
    const d = parseDate('2026-09-01T14:30:00.000Z')
    expect(d.toISOString()).toBe('2026-09-01T14:30:00.000Z')
  })

  it('returns null for junk and empties', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('   ')).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate('not a date')).toBeNull()
  })
})

describe('date formatting helpers', () => {
  it('formats back to dd.MM.yy', () => {
    expect(formatDateDDMMYY(new Date(2024, 2, 15))).toBe('15.03.24')
    expect(formatDateDDMMYY(null)).toBe('')
  })

  it('round-trips through the <input type=date> value', () => {
    expect(toInputValue('15.03.24')).toBe('2024-03-15')
    expect(fromInputValue('2024-03-15')).toBe('15.03.24')
    expect(fromInputValue('')).toBe('')
  })
})

describe('parseMonthsFromTimeFrame', () => {
  it('finds German and English month names as 0-based months', () => {
    expect(parseMonthsFromTimeFrame('Juni')).toEqual([5])
    expect(parseMonthsFromTimeFrame('June')).toEqual([5])
    expect(parseMonthsFromTimeFrame('August / September')).toEqual([7, 8])
  })

  it('de-duplicates a month named in both languages', () => {
    expect(parseMonthsFromTimeFrame('April (April)')).toEqual([3])
  })

  it('returns [] when nothing matches', () => {
    expect(parseMonthsFromTimeFrame('')).toEqual([])
    expect(parseMonthsFromTimeFrame('whenever')).toEqual([])
  })
})

describe('typed date fields', () => {
  it('stores a day in any format as dd.MM.yy', () => {
    expect(normalizeDateText('1.9.2026')).toBe('01.09.26')
    expect(normalizeDateText(' 2026-09-14 ')).toBe('14.09.26')
    expect(normalizeDateText('14.09.26')).toBe('14.09.26')
  })

  it('keeps anything vaguer than a day as typed', () => {
    expect(normalizeDateText('September 2026')).toBe('September 2026')
    expect(normalizeDateText('Juni 2027')).toBe('Juni 2027')
    expect(normalizeDateText('2027')).toBe('2027')
    expect(normalizeDateText('tba')).toBe('tba')
    expect(normalizeDateText('   ')).toBe('')
  })

  it('shows a month as a month, not as its first day', () => {
    expect(displayDateText('september 2026')).toBe('september 2026')
    expect(displayDateText('1.9.26')).toBe('01.09.26')
    // Still a date for the colours and the countdown.
    expect(parseDate('september 2026')).toEqual(new Date(2026, 8, 1))
  })
})
