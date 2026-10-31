import { describe, it, expect } from 'vitest'
import {
  PLACEHOLDERS, languageForRow, resolveTemplate, substitutePlaceholders,
  substituteDoc, substituteTemplate, contactOptionsFor, firstNameOf, lastNameOf, greetingFor,
  DEFAULT_TEMPLATE_OPTIONS,
} from '@core/templates'

const LANGUAGES = {
  default: 'en',
  map: {
    Germany: 'de', Deutschland: 'de',
    Austria: 'de', 'Österreich': 'de',
    Switzerland: 'de', Schweiz: 'de',
  },
}

const de = { id: 'de1', band: 'The Band', language: 'de', subject: 'Anfrage {{venue}}' }
const en = { id: 'en1', band: 'The Band', language: 'en', subject: 'Booking {{venue}}' }
const other = { id: 'x', band: 'Other Band', language: 'de', subject: '' }

describe('languageForRow', () => {
  it('maps the DACH countries to German', () => {
    for (const c of ['Germany', 'Deutschland', 'Austria', 'Österreich', 'Switzerland', 'Schweiz']) {
      expect(languageForRow({ Country: c }, LANGUAGES)).toBe('de')
    }
  })

  it('matches the country case- and whitespace-insensitively', () => {
    expect(languageForRow({ Country: '  gErMaNy ' }, LANGUAGES)).toBe('de')
  })

  it('falls back to the default for an unknown or missing country', () => {
    expect(languageForRow({ Country: 'Iceland' }, LANGUAGES)).toBe('en')
    expect(languageForRow({ Country: '' }, LANGUAGES)).toBe('en')
    expect(languageForRow({}, LANGUAGES)).toBe('en')
  })

  it('honours a different default', () => {
    expect(languageForRow({ Country: 'Iceland' }, { ...LANGUAGES, default: 'fr' })).toBe('fr')
  })
})

describe('resolveTemplate', () => {
  const row = c => ({ Band: 'The Band', Country: c })

  it('picks the exact band + language match', () => {
    const r = resolveTemplate([en, de], row('Germany'), LANGUAGES)
    expect(r.template).toBe(de)
    expect(r.language).toBe('de')
    expect(r.fallbackUsed).toBe(false)
  })

  it('falls back to the default language and says so', () => {
    const r = resolveTemplate([en], row('Germany'), LANGUAGES)
    expect(r.template).toBe(en)
    expect(r.language).toBe('en')
    expect(r.fallbackUsed).toBe(true)
    expect(r.reason).toMatch(/no “de” template/i)
  })

  it('returns nothing when neither language exists for the band', () => {
    const r = resolveTemplate([de], { Band: 'The Band', Country: 'France' }, LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no “en” or “en”|no “en”/i)
  })

  it('returns nothing for a band with no templates at all', () => {
    const r = resolveTemplate([other], row('Germany'), LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no templates for “The Band”/i)
  })

  it('returns nothing when the venue has no band', () => {
    const r = resolveTemplate([en, de], { Country: 'Germany' }, LANGUAGES)
    expect(r.template).toBeNull()
    expect(r.reason).toMatch(/no band/i)
  })

  it('an unknown country still resolves via the default language', () => {
    const r = resolveTemplate([en, de], row('Iceland'), LANGUAGES)
    expect(r.template).toBe(en)
    expect(r.fallbackUsed).toBe(false)
  })
})

describe('substitutePlaceholders', () => {
  const row = { Venue: 'Club X', Contact: 'Anna', City: 'Berlin', Country: 'Germany', Band: 'The Band', Dates: 'Jun 2026', Text: '' }

  it('replaces every supported placeholder', () => {
    const { text } = substitutePlaceholders('{{venue}} / {{contact}} / {{city}} / {{country}} / {{band}} / {{dates}}', row)
    expect(text).toBe('Club X / Anna / Berlin / Germany / The Band / Jun 2026')
  })

  it('covers exactly the documented placeholder list', () => {
    expect(PLACEHOLDERS).toEqual(['greeting', 'venue', 'contact', 'city', 'country', 'dates', 'text', 'band', 'article'])
    for (const p of PLACEHOLDERS) {
      expect(substitutePlaceholders(`{{${p}}}`, row).text).not.toContain('{{')
    }
  })

  it('replaces a missing field with nothing and reports it', () => {
    const { text, empties } = substitutePlaceholders('Hi {{contact}}{{text}}!', { Venue: 'V' })
    expect(text).toBe('Hi !')
    expect(empties.sort()).toEqual(['contact', 'text'])
  })

  it('reports a blank (whitespace-only) field as empty', () => {
    expect(substitutePlaceholders('{{contact}}', { Contact: '   ' }).empties).toEqual(['contact'])
  })

  it('uses only the first name when asked to', () => {
    const opts = { contactStyle: 'first' }
    expect(substitutePlaceholders('{{contact}}', { Contact: 'Anna Müller' }, opts).text).toBe('Anna')
    // Surname-first, as the CSV occasionally records it.
    expect(substitutePlaceholders('{{contact}}', { Contact: 'Müller, Anna' }, opts).text).toBe('Anna')
    expect(substitutePlaceholders('{{contact}}', { Contact: 'Anna' }, opts).text).toBe('Anna')
  })

  it('falls back to the configured greeting when there is no contact', () => {
    const opts = { contactFallback: '{{venue}} Team' }
    const { text, empties } = substitutePlaceholders('Hallo {{contact}},', { Venue: 'Club X' }, opts)
    // The fallback is itself a template, so {{venue}} inside it resolves too.
    expect(text).toBe('Hallo Club X Team,')
    // With a fallback in place, the missing contact is no longer a warning.
    expect(empties).not.toContain('contact')
  })

  it('reports the fields a fallback itself could not fill', () => {
    const { text, empties } = substitutePlaceholders('{{contact}}', {}, { contactFallback: '{{venue}} team' })
    expect(text).toBe(' team')
    expect(empties).toEqual(['venue'])
  })

  it('cannot recurse through a fallback that mentions {{contact}}', () => {
    const { text } = substitutePlaceholders('{{contact}}', {}, { contactFallback: 'Hi {{contact}}' })
    expect(text).toBe('Hi ')
  })

  it('keeps the old behaviour when no options are given', () => {
    expect(substitutePlaceholders('{{contact}}', { Contact: 'Anna Müller' }).text).toBe('Anna Müller')
    expect(substitutePlaceholders('{{contact}}', {}).empties).toEqual(['contact'])
  })

  it('tolerates whitespace and case inside the braces', () => {
    expect(substitutePlaceholders('{{ Venue }}', row).text).toBe('Club X')
  })

  it('leaves an unknown placeholder untouched', () => {
    const { text, empties } = substitutePlaceholders('{{nope}}', row)
    expect(text).toBe('{{nope}}')
    expect(empties).toEqual([])
  })
})

describe('substituteDoc', () => {
  const row = { Venue: 'Club X', Contact: 'Anna', Band: 'The Band' }

  it('substitutes inside text nodes, marks intact', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hallo ' },
          { type: 'text', marks: [{ type: 'bold' }], text: '{{contact}}' },
          { type: 'text', text: ' vom {{venue}}' },
        ],
      }],
    }
    const { doc: out } = substituteDoc(doc, row)
    const texts = out.content[0].content.map(n => n.text)
    expect(texts).toEqual(['Hallo ', 'Anna', ' vom Club X'])
    expect(out.content[0].content[1].marks[0].type).toBe('bold')
  })

  it('substitutes inside attributes such as a link href', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'link', attrs: { href: 'https://x.de/{{city}}' } }], text: 'link' }],
      }],
    }
    const { doc: out, empties } = substituteDoc(doc, { City: 'Berlin' })
    expect(out.content[0].content[0].marks[0].attrs.href).toBe('https://x.de/Berlin')
    expect(empties).toEqual([])
  })

  it('collects empties from anywhere in the tree', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '{{contact}}' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '{{dates}}' }] },
      ],
    }
    expect(substituteDoc(doc, { Venue: 'V' }).empties.sort()).toEqual(['contact', 'dates'])
  })

  it('does not mutate the stored template document', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{venue}}' }] }] }
    substituteDoc(doc, row)
    expect(doc.content[0].content[0].text).toBe('{{venue}}')
  })
})

describe('substituteTemplate', () => {
  it('does subject and body together and merges the empties', () => {
    const template = {
      subject: 'Anfrage {{venue}} ({{dates}})',
      bodyJSON: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo {{contact}}' }] }] },
    }
    const out = substituteTemplate(template, { Venue: 'Club X' })
    expect(out.subject).toBe('Anfrage Club X ()')
    expect(out.bodyJSON.content[0].content[0].text).toBe('Hallo ')
    expect(out.empties.sort()).toEqual(['contact', 'dates'])
  })
})

describe('firstNameOf', () => {
  it('takes the first token, or the part after a comma', () => {
    expect(firstNameOf('Anna Müller')).toBe('Anna')
    expect(firstNameOf('  Anna   Müller ')).toBe('Anna')
    expect(firstNameOf('Müller, Anna')).toBe('Anna')
    expect(firstNameOf('Anna')).toBe('Anna')
    expect(firstNameOf('')).toBe('')
    expect(firstNameOf(null)).toBe('')
  })
})

describe('contactOptionsFor', () => {
  const settings = {
    languages: LANGUAGES,
    templates: { contactStyle: 'first', contactFallbacks: { en: '{{venue}} team', de: '{{venue}} Team' } },
  }

  it('picks the fallback for the language the venue maps to', () => {
    expect(contactOptionsFor({ Country: 'Germany' }, settings).contactFallback).toBe('{{venue}} Team')
    expect(contactOptionsFor({ Country: 'France' }, settings).contactFallback).toBe('{{venue}} team')
  })

  it('falls back to the default language for an unmapped country', () => {
    // France is not in the map, so the default language (en) decides.
    expect(contactOptionsFor({ Country: 'France' }, settings).contactStyle).toBe('first')
  })

  it('uses the built-in defaults when settings say nothing', () => {
    const opts = contactOptionsFor({ Country: 'Germany' }, {})
    expect(opts.contactStyle).toBe('full')
    expect(opts.contactFallback).toBe(DEFAULT_TEMPLATE_OPTIONS.contactFallbacks.en)
  })

  it('rejects an unknown contactStyle rather than passing it through', () => {
    expect(contactOptionsFor({}, { templates: { contactStyle: 'nonsense' } }).contactStyle).toBe('full')
  })
})

describe('substituteTemplate with contact options', () => {
  it('applies the fallback to both the subject and the body', () => {
    const template = {
      subject: 'Hallo {{contact}}',
      bodyJSON: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi {{contact}},' }] }] },
    }
    const out = substituteTemplate(template, { Venue: 'Club X' }, { contactFallback: '{{venue}} Team' })
    expect(out.subject).toBe('Hallo Club X Team')
    expect(out.bodyJSON.content[0].content[0].text).toBe('Hi Club X Team,')
    expect(out.empties).not.toContain('contact')
  })
})

describe('substitutePlaceholders — {{article}}', () => {
  const row = { Venue: 'Kulturfabrik', Contact: 'Anna' }

  it('declines and contracts using the venue gender', () => {
    const { text } = substitutePlaceholders('Wir spielen in {{article}} {{venue}}', row, { gender: 'f' })
    expect(text).toBe('Wir spielen in der Kulturfabrik')
  })

  it('contracts for a neuter venue', () => {
    const { text } = substitutePlaceholders('Wir spielen in {{article}} {{venue}}', { Venue: 'Kulturzentrum' }, { gender: 'n' })
    expect(text).toBe('Wir spielen im Kulturzentrum')
  })

  it('drops the token and reports it when no gender is known', () => {
    const { text, empties } = substitutePlaceholders('Wir spielen in {{article}} {{venue}}', row)
    expect(text).toBe('Wir spielen in Kulturfabrik')
    expect(empties).toContain('article')
  })

  it('does not report it when the template never used it', () => {
    const { empties } = substitutePlaceholders('Hallo {{contact}}', row)
    expect(empties).not.toContain('article')
  })
})

describe('lastNameOf', () => {
  it('reads surnames, particles included', () => {
    expect(lastNameOf('Anna Müller')).toBe('Müller')
    expect(lastNameOf('Müller, Anna')).toBe('Müller')
    expect(lastNameOf('Jan van der Berg')).toBe('van der Berg')
    expect(lastNameOf('Anna Maria Müller')).toBe('Müller')
    expect(lastNameOf('Anna')).toBe('Anna')
  })
})

describe('{{greeting}}', () => {
  const g = (contact, style, gender, language = 'de') => greetingFor({ contact, style, gender, language, fallback: 'Jazzfabrik Team' })

  it('German: Liebe / Lieber / Hallo, or formally', () => {
    expect([g('Anna Müller', 'first', 'f'), g('Anna Müller', 'full', 'f'), g('Anna Müller', 'formal', 'f')])
      .toEqual(['Liebe Anna', 'Liebe Anna Müller', 'Sehr geehrte Frau Müller'])
    expect([g('Thomas Schmidt', 'first', 'm'), g('Thomas Schmidt', 'formal', 'm')]).toEqual(['Lieber Thomas', 'Sehr geehrter Herr Schmidt'])
    expect([g('Kim Weber', 'first', 'x'), g('Kim Weber', 'formal'), g('Kim Weber', 'full')]).toEqual(['Hallo Kim', 'Guten Tag Kim Weber', 'Hallo Kim Weber'])
    expect([g('', 'first'), g('', 'formal')]).toEqual(['Liebes Jazzfabrik Team', 'Sehr geehrte Damen und Herren'])
  })

  it('English', () => {
    expect([g('Anna Müller', 'first', 'f', 'en'), g('Anna Müller', 'formal', 'f', 'en'), g('Tom Smith', 'formal', 'm', 'en'), g('Kim Weber', 'formal', 'x', 'en')])
      .toEqual(['Dear Anna', 'Dear Ms Müller', 'Dear Mr Smith', 'Dear Kim Weber'])
  })

  it('is filled in from the row and the options', () => {
    const opts = { contactStyle: 'first', language: 'de', contactGender: 'f', contactFallback: '{{venue}} Team' }
    expect(substitutePlaceholders('{{greeting}},', { Contact: 'Anna Müller' }, opts).text).toBe('Liebe Anna,')
    expect(substitutePlaceholders('{{greeting}},', { Venue: 'Club X' }, { ...opts, contactGender: undefined }).text).toBe('Liebes Club X Team,')
    expect(substitutePlaceholders('{{ greeting }},', { Contact: 'Kim' }, {}).text).toBe('Dear Kim,')
  })

  it('formal also turns {{contact}} into the full name', () => {
    const settings = { templates: { contactStyle: 'formal' } }
    expect(contactOptionsFor({}, settings).contactStyle).toBe('formal')
    expect(substitutePlaceholders('{{contact}}', { Contact: 'Anna Müller' }, { contactStyle: 'formal' }).text).toBe('Anna Müller')
  })
})
