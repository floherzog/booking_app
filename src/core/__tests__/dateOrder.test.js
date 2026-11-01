import { describe, it, expect, afterEach } from 'vitest'
import { setDateOrder, displayDateText, normalizeDateText, formatDay, formatDateDDMMYY } from '@core/parseDate'

afterEach(() => setDateOrder('dmy'))

describe('date order', () => {
  const nov1 = new Date(2026, 10, 1)
  it('shows day first by default, month first when asked', () => {
    expect(formatDay(nov1)).toBe('01.11.26')
    expect(displayDateText('01.11.26')).toBe('01.11.26')
    setDateOrder('mdy')
    expect(formatDay(nov1)).toBe('11/01/26')
    expect(displayDateText('01.11.26')).toBe('11/01/26')
    expect(displayDateText('September 2026')).toBe('September 2026')
  })
  it('reads an ambiguous slash date in the chosen order, and always stores dd.MM.yy', () => {
    expect(normalizeDateText('11/01/26')).toBe('11.01.26')
    setDateOrder('mdy')
    expect(normalizeDateText('11/01/26')).toBe('01.11.26')
    expect(normalizeDateText('13/01/26')).toBe('13.01.26') // can only be day first
    expect(normalizeDateText('01.11.26')).toBe('01.11.26') // dots are always day first
    expect(formatDateDDMMYY(nov1)).toBe('01.11.26')
  })
})
