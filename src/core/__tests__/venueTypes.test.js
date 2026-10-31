import { describe, it, expect } from 'vitest'
import { DEFAULT_VENUE_TYPES, normalizeVenueTypes, effectiveTypeOptions } from '@core/venueTypes'

describe('normalizeVenueTypes', () => {
  it('trims, drops empties and keeps the given order', () => {
    expect(normalizeVenueTypes([' club ', '', '  ', 'bar'])).toEqual(['club', 'bar'])
  })

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(normalizeVenueTypes(['Club', 'club', 'CLUB'])).toEqual(['Club'])
  })

  it('tolerates objects and a missing list', () => {
    expect(normalizeVenueTypes([{ name: 'club' }])).toEqual(['club'])
    expect(normalizeVenueTypes(null)).toEqual([])
  })
})

describe('effectiveTypeOptions', () => {
  const rows = [{ Type: 'club' }, { Type: 'dead' }, { Type: '' }, {}]

  it('unions the managed list with what the rows already use', () => {
    expect(effectiveTypeOptions(rows, DEFAULT_VENUE_TYPES))
      .toEqual(['club', 'dead', 'festival', 'filler', 'main'])
  })

  it('never loses a value a venue is already using', () => {
    // "club" is not managed, but a venue has it — it must stay selectable.
    expect(effectiveTypeOptions(rows, ['main'])).toContain('club')
  })

  it('does not duplicate a row value that differs only in case', () => {
    expect(effectiveTypeOptions([{ Type: 'Main' }], ['main'])).toEqual(['main'])
  })

  it('works with no rows and no managed list', () => {
    expect(effectiveTypeOptions([], [])).toEqual([])
    expect(effectiveTypeOptions(null, DEFAULT_VENUE_TYPES)).toEqual(['dead', 'festival', 'filler', 'main'])
  })
})

import { normalizeTypeRules, setTypeRule, typeRuleFor, bandBooksType, typeUsage, migrateVenueTypes, DEFAULT_TYPE_RULES } from '@core/venueTypes'
import { normalizeSettings } from '@core/settings'

describe('venue-type rules', () => {
  it('starts from the built-in behaviour, with the bands that booked fillers', () => {
    const r = normalizeTypeRules(undefined, ['Alpha'])
    expect(r).toEqual({
      dead: { behaves: 'never', bands: null, frequencyDays: null },
      festival: { behaves: 'festival', bands: null, frequencyDays: null },
      filler: { behaves: 'normal', bands: ['Alpha'], frequencyDays: null },
    })
    expect(bandBooksType(r, 'Filler', ' alpha')).toBe(true)
    expect(bandBooksType(r, 'filler', 'Beta')).toBe(false)
    expect(bandBooksType(r, 'main', 'Beta')).toBe(true)
  })

  it('keeps only rules that differ from an ordinary type', () => {
    let r = setTypeRule(DEFAULT_TYPE_RULES, 'Club', { frequencyDays: '60' })
    expect(typeRuleFor(r, 'club').frequencyDays).toBe(60)
    r = setTypeRule(r, 'club', { frequencyDays: null })
    expect(r.club).toBeUndefined()
    expect(normalizeTypeRules({ bar: { behaves: 'weird', bands: 'x' } })).toEqual({})
  })

  it('says where a type is used before it is deleted', () => {
    const rows = [{ Type: 'festival' }, { Type: 'Festival' }, { Type: 'main' }]
    expect(typeUsage(DEFAULT_TYPE_RULES, 'festival', rows)).toEqual({
      rule: ['Type is “festival” and the festival booking window is closed'], venues: 2,
    })
    expect(typeUsage(DEFAULT_TYPE_RULES, 'main', rows)).toEqual({ rule: [], venues: 1 })
  })
})

describe('settings from before venue-type rules', () => {
  it('get the built-in types back once, and the filler checkbox becomes the filler rule', () => {
    expect(migrateVenueTypes(['main', 'festival', 'dead'], undefined)).toEqual(['main', 'festival', 'dead', 'filler'])
    expect(migrateVenueTypes(['main'], 2)).toEqual(['main'])
    const s = normalizeSettings({ venueTypes: ['main', 'dead'], bands: [{ name: 'Alpha', bookFiller: true }, { name: 'Beta' }] })
    expect(s.venueTypes).toEqual(['main', 'dead', 'festival', 'filler'])
    expect(s.venueTypeRules.filler.bands).toEqual(['Alpha'])
    expect(s.bands[0]).not.toHaveProperty('bookFiller')
    // Saved again, nothing comes back.
    expect(normalizeSettings({ ...s, venueTypes: ['main'] }).venueTypes).toEqual(['main'])
  })
})
