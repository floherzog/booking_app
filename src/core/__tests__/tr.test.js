import { describe, it, expect } from 'vitest'
import { formatText } from '@core/tr'

describe('formatText', () => {
  it('fills placeholders and leaves unknown ones', () => {
    expect(formatText('Showing {n} of {total}', { n: 3, total: 9 })).toBe('Showing 3 of 9')
    expect(formatText('Hi {who}', {})).toBe('Hi {who}')
    expect(formatText('Plain')).toBe('Plain')
  })
  it('picks the plural form by n', () => {
    expect(formatText('{n} venue|{n} venues', { n: 1 })).toBe('1 venue')
    expect(formatText('{n} venue|{n} venues', { n: 0 })).toBe('0 venues')
    expect(formatText('a|b')).toBe('a|b')
  })
})
