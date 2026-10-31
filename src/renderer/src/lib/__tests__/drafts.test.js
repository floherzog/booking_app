import { describe, it, expect } from 'vitest'
import { prepareDraft, draftKey, draftedAt } from '../drafts'

const LANGUAGES = { default: 'en', map: { Germany: 'de' } }

const template = (language, subject) => ({
  id: `t-${language}`,
  band: 'The Band',
  language,
  subject,
  bodyJSON: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo {{contact}} — {{dates}}' }] }] },
})

const DE = template('de', 'Anfrage {{venue}}')
const EN = template('en', 'Booking {{venue}}')

const ROW = {
  _idx: 3, Band: 'The Band', Country: 'Germany', Venue: 'Club X', City: 'Berlin',
  Contact: 'Anna', Email: 'venue@example.com', Dates: '', 'Last emailed': '01.01.25',
}

describe('prepareDraft', () => {
  it('builds a ready-to-send payload from the matching template', () => {
    const p = prepareDraft(ROW, [DE, EN], LANGUAGES)
    expect(p.ok).toBe(true)
    expect(p.language).toBe('de')
    expect(p.draft.to).toBe('venue@example.com')
    expect(p.draft.subject).toBe('Anfrage Club X')
    expect(p.draft.html).toContain('Hallo Anna')
    expect(p.draft.html).not.toContain('{{')
    expect(p.empties).toEqual(['dates'])
  })

  it('writes only the real addresses, and refuses an online form', () => {
    expect(prepareDraft({ ...ROW, Email: 'Anna <venue@example.com>; b@example.com' }, [DE, EN], LANGUAGES).draft.to)
      .toBe('venue@example.com, b@example.com')
    const p = prepareDraft({ ...ROW, Email: 'Kontaktformular' }, [DE, EN], LANGUAGES)
    expect(p.ok).toBe(false)
    expect(p.reason).toBe('This venue only takes an online form.')
  })

  it('refuses a venue with no email, and says why', () => {
    const p = prepareDraft({ ...ROW, Email: '  ' }, [DE, EN], LANGUAGES)
    expect(p.ok).toBe(false)
    // Regression: `resolved` used to be spread after `reason` and blanked it.
    expect(p.reason).toBe('No email address for this venue.')
  })

  it('refuses a venue whose band has no template, and says why', () => {
    const p = prepareDraft({ ...ROW, Band: 'Other' }, [DE, EN], LANGUAGES)
    expect(p.ok).toBe(false)
    expect(p.reason).toMatch(/no templates for "Other"/i)
  })

  it('every refusal carries a non-empty reason', () => {
    for (const bad of [
      { ...ROW, Email: '' },
      { ...ROW, Band: '' },
      { ...ROW, Band: 'Unknown' },
    ]) {
      const p = prepareDraft(bad, [DE, EN], LANGUAGES)
      expect(p.ok).toBe(false)
      expect(p.reason.length).toBeGreaterThan(0)
    }
    // …and when only the wrong-language template exists.
    const p = prepareDraft({ ...ROW, Country: 'France' }, [DE], LANGUAGES)
    expect(p.ok).toBe(false)
    expect(p.reason.length).toBeGreaterThan(0)
  })

  it('reports a language fallback while still producing a draft', () => {
    const p = prepareDraft(ROW, [EN], LANGUAGES)
    expect(p.ok).toBe(true)
    expect(p.fallbackUsed).toBe(true)
    expect(p.draft.subject).toBe('Booking Club X')
  })

  it('never produces an edit to the venue row', () => {
    const before = JSON.stringify(ROW)
    const p = prepareDraft(ROW, [DE, EN], LANGUAGES)
    // The payload carries only what an email needs — no CSV fields, and in
    // particular nothing that could update 'Last emailed'. accountId names the
    // mailbox it goes out from, which main resolves to real credentials.
    expect(Object.keys(p.draft).sort()).toEqual(['accountId', 'cids', 'html', 'subject', 'to'])
    expect(JSON.stringify(ROW)).toBe(before)
  })
})

describe('draftKey / draftedAt', () => {
  it('keys a venue by Venue||City||Band so it survives re-sorting', () => {
    expect(draftKey(ROW)).toBe('Club X||Berlin||The Band')
    expect(draftKey({})).toBe('||||')
  })

  it('reads a timestamp back out of the settings draft log', () => {
    const settings = { draftLog: { 'Club X||Berlin||The Band': '2026-09-01T10:00:00.000Z' } }
    expect(draftedAt(settings, ROW)).toBe('2026-09-01T10:00:00.000Z')
    expect(draftedAt({}, ROW)).toBeNull()
    expect(draftedAt(settings, { ...ROW, City: 'Köln' })).toBeNull()
  })
})

describe('prepareDraft — which mailbox it sends from', () => {
  const SETTINGS = {
    mail: {
      accounts: [
        { id: 'default', user: 'main@x.com' },
        { id: 'account-1', user: 'side@x.com' },
      ],
    },
    bands: [{ name: 'The Band', mailAccountId: 'account-1' }],
  }

  it('routes a row through its band to that band’s account', () => {
    const p = prepareDraft(ROW, [DE, EN], LANGUAGES, SETTINGS)
    expect(p.draft.accountId).toBe('account-1')
  })

  it('falls back to the default account for an unassigned band', () => {
    const p = prepareDraft(ROW, [DE, EN], LANGUAGES, { ...SETTINGS, bands: [{ name: 'The Band' }] })
    expect(p.draft.accountId).toBe('default')
  })

  it('falls back when the band names an account that has been deleted', () => {
    const p = prepareDraft(ROW, [DE, EN], LANGUAGES, {
      ...SETTINGS,
      bands: [{ name: 'The Band', mailAccountId: 'gone' }],
    })
    expect(p.draft.accountId).toBe('default')
  })

  it('names the default account even with no settings at all', () => {
    expect(prepareDraft(ROW, [DE, EN], LANGUAGES).draft.accountId).toBe('default')
  })
})
