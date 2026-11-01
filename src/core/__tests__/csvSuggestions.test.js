import { describe, it, expect } from 'vitest'
import { csvSuggestions } from '@core/csvSuggestions'

const settings = {
  bands: [{ name: 'Trillmann' }, { name: 'Old Band' }],
  venueTypes: ['main', 'festival', 'filler'],
  languages: { default: 'en', map: { Germany: 'de' } },
}
const rows = [
  { Band: 'Trillmann', Type: 'Main', Country: 'Germany' },
  { Band: 'New Band', Type: 'club', Country: 'Italy' },
  { Band: ' new band ', Type: 'club', Country: 'italy' },
  { Band: 'Solo', Type: '', Country: 'France' },
  { Band: '', Type: 'festival', Country: '' },
]

describe('csvSuggestions', () => {
  it('lists what the CSV uses and Settings lacks, most-used first, without case or spaces', () => {
    const s = csvSuggestions(rows, settings)
    expect(s.bands).toEqual([{ name: 'New Band', count: 2 }, { name: 'Solo', count: 1 }])
    expect(s.venueTypes).toEqual([{ name: 'club', count: 2 }])
    expect(s.countries.map(c => c.name)).toEqual(['Italy', 'France'])
  })
  it('lists bands and types nothing uses', () => {
    const s = csvSuggestions(rows, settings)
    expect(s.unusedBands).toEqual(['Old Band'])
    expect(s.unusedTypes).toEqual(['filler'])
  })
  it('leaves out dismissed values, and counts every band of a multi-band venue', () => {
    expect(csvSuggestions(rows, settings, { dismissed: { bands: ['solo'] } }).bands.map(b => b.name)).toEqual(['New Band'])
    const multi = [{ Band: 'Trillmann', _entries: [{ Band: 'Trillmann' }, { Band: 'Duo' }], Type: 'main', Country: 'Germany' }]
    expect(csvSuggestions(multi, settings).bands.map(b => b.name)).toEqual(['Duo'])
  })
})
