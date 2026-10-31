import { describe, it, expect } from 'vitest'
import {
  EMPTY_FILTERS, matchesFilters, filtersEqual, isEmptyFilters, toggleShortcut, selectStatus,
  describeFilters, normalizeFilterChips,
} from '@core/filterRows'
import { normalizeSettings } from '@core/settings'

const rows = [
  { _idx: 0, _status: 'SEND', Venue: 'Jazzfabrik', Band: 'Almost Natural', Country: 'Germany', Email: 'a@b.cc', Draft: 'TRUE' },
  { _idx: 1, _status: 'CONFIRMED', Venue: 'Moldejazz', Band: 'Trillmann', Country: 'Norway', Email: 'm@b.cc', 'Last played': '01.07.27' },
  { _idx: 2, _status: 'NEVER_CONTACTED', Venue: 'Achter', Band: 'Almost Natural', Country: 'Germany', Email: '' },
]
const shown = (f, ctx) => rows.filter(r => matchesFilters(r, f, ctx)).map(r => r._idx)

describe('matchesFilters', () => {
  it('lets everything through with no filters', () => {
    expect(shown(EMPTY_FILTERS)).toEqual([0, 1, 2])
  })

  it('combines dropdowns, search, a shortcut and column filters', () => {
    expect(shown({ band: 'Almost Natural', country: 'Germany' })).toEqual([0, 2])
    expect(shown({ search: 'molde' })).toEqual([1])
    expect(shown({ nextBatch: true })).toEqual([0])
    expect(shown({ actionOnly: true })).toEqual([0, 2])
    expect(shown({ advanced: [{ field: '_status', value: 'CONFIRMED' }] })).toEqual([1])
    expect(shown({ advanced: [{ field: 'Last played', value: '27' }, { field: 'Venue', value: '' }] })).toEqual([1])
    expect(shown({ duplicate: true }, { isDuplicate: r => r._idx === 2 })).toEqual([2])
  })
})

describe('chips switching filters', () => {
  it('a shortcut or a status turns the other chips off and keeps the rest', () => {
    const f = { ...EMPTY_FILTERS, band: 'Trillmann', status: 'SEND', missingInfo: true }
    expect(toggleShortcut(f, 'nextBatch')).toMatchObject({ band: 'Trillmann', status: '', missingInfo: false, nextBatch: true })
    expect(toggleShortcut({ ...f, nextBatch: true }, 'nextBatch').nextBatch).toBe(false)
    expect(selectStatus(f, 'CONFIRMED')).toMatchObject({ band: 'Trillmann', status: 'CONFIRMED', missingInfo: false })
  })
})

describe('filtersEqual', () => {
  it('ignores what does not change the result', () => {
    expect(filtersEqual({ search: ' jazz ' }, { ...EMPTY_FILTERS, search: 'jazz' })).toBe(true)
    expect(filtersEqual({ advanced: [{ field: 'Venue', value: '' }], sort: { field: '', dir: 'desc' } }, EMPTY_FILTERS)).toBe(true)
    expect(isEmptyFilters({ ...EMPTY_FILTERS })).toBe(true)
  })

  it('tells apart filters that differ', () => {
    expect(filtersEqual({ band: 'A' }, { band: 'B' })).toBe(false)
    expect(filtersEqual({ sort: { field: 'Venue', dir: 'asc' } }, { sort: { field: 'Venue', dir: 'desc' } })).toBe(false)
    expect(isEmptyFilters({ status: 'SEND' })).toBe(false)
  })
})

describe('describeFilters', () => {
  it('names each part in words', () => {
    const text = describeFilters({ status: 'CONFIRMED', band: 'Trillmann', search: 'jazz', sort: { field: 'Venue', dir: 'desc' } })
    expect(text).toBe('Status: Confirmed · Band: Trillmann · Search: “jazz” · sorted by Venue ↓')
    expect(describeFilters(EMPTY_FILTERS)).toBe('No filters')
  })
})

describe('normalizeFilterChips', () => {
  it('drops broken entries and fills in missing filter keys', () => {
    const chips = normalizeFilterChips({
      hidden: ['DEAD', 3, 'autoSend'],
      custom: [{ id: 'x', name: ' Norway ', filters: { country: 'Norway' } }, { name: '' , filters: {} }, { name: 'no filters' }],
    })
    expect(chips.hidden).toEqual(['DEAD', 'autoSend'])
    expect(chips.custom).toEqual([{ id: 'x', name: 'Norway', filters: { ...EMPTY_FILTERS, country: 'Norway' } }])
  })

  it('is part of the settings, empty by default', () => {
    expect(normalizeSettings({}).filterChips).toEqual({ hidden: [], custom: [] })
  })
})
