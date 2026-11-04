import { describe, it, expect } from 'vitest'
import { emailAddresses, isOtherChannel, onlineFormUrl, sendBlockers, getMissingFields, getMissingSeverity } from '@core/constants'
import { classifyContext } from '@core/classify'
import { matchesFilters } from '@core/filterRows'

describe('emailAddresses', () => {
  it('finds every address and nothing else', () => {
    expect(emailAddresses('info@club.de')).toEqual(['info@club.de'])
    expect(emailAddresses('Anna <anna@club.de>; booking@club.de, info@club.de')).toEqual(['anna@club.de', 'booking@club.de', 'info@club.de'])
    for (const junk of ['', 'tbd', 'n/a', 'see website', 'info@club', '@club.de']) expect(emailAddresses(junk)).toEqual([])
  })
})

describe('isOtherChannel', () => {
  it('spots the usual ways of writing it, in Email or Contact', () => {
    for (const Email of ['online form', 'Online-Form only', 'contact form', 'Kontaktformular', 'nur über Formular', 'via form', 'webform', 'https://club.de/booking']) {
      expect(isOtherChannel({ Email })).toBe(true)
    }
    expect(isOtherChannel({ Email: '', Contact: 'Kontaktformular auf der Website' })).toBe(true)
  })

  it('a real address wins, and ordinary text is no form', () => {
    expect(isOtherChannel({ Email: 'info@club.de (or the contact form)' })).toBe(false)
    expect(isOtherChannel({ Email: 'tbd', Contact: 'Anna Formby' })).toBe(false)
    expect(isOtherChannel({ Email: 'information pending' })).toBe(false)
  })

  it('hands back the form’s address when there is one', () => {
    expect(onlineFormUrl({ Email: 'form: https://club.de/booking).' })).toBe('https://club.de/booking')
    expect(onlineFormUrl({ Email: 'online form' })).toBe('')
  })

  it('reads the Note too, but only when there is no address and only plain wording', () => {
    for (const Note of ['Anfragen nur über das Formular', 'nur Kontaktformular', 'Booking via webform, see site', 'online form only']) {
      expect(isOtherChannel({ Email: '', Note })).toBe(true)
    }
    expect(isOtherChannel({ Email: 'info@club.de', Note: 'nur über Kontaktformular' })).toBe(false)
    expect(isOtherChannel({ Email: '', Note: 'Text anders formulieren' })).toBe(false)
    expect(isOtherChannel({ Email: '', Note: 'Website: https://club.de' })).toBe(false)
    expect(onlineFormUrl({ Email: '', Note: 'Kontaktformular: https://club.de/kontakt' })).toBe('https://club.de/kontakt')
    expect(onlineFormUrl({ Email: '', Note: 'see https://club.de' })).toBe('')
  })

  it('has its own chip', () => {
    expect(matchesFilters({ Email: 'online form' }, { onlineForm: true })).toBe(true)
    expect(matchesFilters({ Email: 'a@club.de' }, { onlineForm: true })).toBe(false)
  })
})

describe('sendBlockers and the red "!"', () => {
  const ctx = classifyContext({ bands: [{ name: 'Alpha', tourDates: 'May 2027' }, { name: 'Beta' }] }, [{ band: 'Alpha' }])
  const row = extra => ({ Venue: 'Club', Band: 'Alpha', Email: 'a@club.de', Contact: 'Anna', City: 'Köln', ...extra })

  it('names what keeps a venue from being emailed', () => {
    expect(sendBlockers(row(), ctx)).toEqual([])
    expect(sendBlockers(row({ Email: 'tbd' }), ctx)).toEqual(['Email'])
    expect(sendBlockers(row({ Band: 'Beta' }), ctx)).toEqual(['Dates', 'Template'])
    expect(sendBlockers(row({ Band: 'Beta', Dates: 'June' }), ctx)).toEqual(['Template'])
    expect(sendBlockers(row({ Band: 'Beta' }))).toEqual([])
  })

  it('adds contact and location, which don’t block sending', () => {
    expect(getMissingFields(row({ Contact: '', City: '' }), ctx)).toEqual(['Contact', 'Location'])
    expect(getMissingSeverity(row({ Contact: '' }), ctx)).toBe(1)
    expect(getMissingSeverity(row({ Band: 'Beta' }), ctx)).toBe(2)
    expect(getMissingSeverity(row({ Email: 'tbd' }), ctx)).toBe(3)
    expect(getMissingSeverity(row(), ctx)).toBe(0)
  })
})

describe('contactChannel', async () => {
  const { contactChannel, isPhoneOnly } = await import('@core/constants')
  it('groups messengers with forms and keeps phone apart', () => {
    expect(contactChannel({ Email: 'Instagram' })).toEqual({ kind: 'message', name: 'Instagram' })
    expect(contactChannel({ Email: 'whatsapp +49 171 1234567' })).toEqual({ kind: 'message', name: 'WhatsApp' })
    expect(isOtherChannel({ Email: 'Instagram' })).toBe(true)
    expect(isPhoneOnly({ Email: 'Tel. 030 1234567' })).toBe(true)
    expect(isPhoneOnly({ Email: '', Note: 'nur telefonisch' })).toBe(true)
    expect(isOtherChannel({ Email: '', Note: 'Anfrage über WhatsApp' })).toBe(true)
  })
  it('needs more than a mention in a Note, and never applies with an address', () => {
    expect(contactChannel({ Email: '', Note: 'their instagram is great' })).toBe(null)
    expect(contactChannel({ Email: 'a@club.de', Note: 'via Instagram' })).toBe(null)
    expect(contactChannel({ Email: 'Julius fragen' })).toBe(null)
  })
  it('does not count as a missing email', () => {
    expect(sendBlockers({ Venue: 'X', Band: 'B', Email: 'Instagram' })).not.toContain('Email')
    expect(matchesFilters({ Email: 'phone only' }, { phoneOnly: true })).toBe(true)
  })
})
