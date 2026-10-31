import { describe, it, expect } from 'vitest'
import { classifyBooking, classifyContext } from '@core/classify'
import { normalizeTypeRules, setTypeRule } from '@core/venueTypes'
import { STATUS } from '@core/constants'
import { DEFAULT_RULES, mergeRules } from '@core/rules'

// A fixed "today" so every threshold in the tests is exact.
const TODAY = new Date(2025, 5, 15) // 15 June 2025

// A row that satisfies the send-required fields; override what each test needs.
function row(extra = {}) {
  return { Venue: 'Club X', Band: 'The Band', Email: 'a@b.cc', ...extra }
}

describe('classifyBooking — every status with the default rules', () => {
  it('DEAD wins over everything', () => {
    expect(classifyBooking(row({ Type: 'dead', Note: 'anrufen' }), TODAY)).toBe(STATUS.DEAD)
  })

  it('MISSING_INFO when a send-required field is blank', () => {
    expect(classifyBooking({ Venue: 'Club X', Band: '', Email: 'a@b.cc' }, TODAY)).toBe(STATUS.MISSING_INFO)
    expect(classifyBooking({ Venue: '', Band: 'B', Email: 'a@b.cc' }, TODAY)).toBe(STATUS.MISSING_INFO)
    expect(classifyBooking({ Venue: 'V', Band: 'B', Email: '' }, TODAY)).toBe(STATUS.MISSING_INFO)
  })

  it('RECENTLY_PLAYED inside the 365-day window, and not outside it', () => {
    expect(classifyBooking(row({ 'Last played': '01.01.25' }), TODAY)).toBe(STATUS.RECENTLY_PLAYED)
    // 2 years ago → no longer blocking.
    expect(classifyBooking(row({ 'Last played': '01.01.23' }), TODAY)).not.toBe(STATUS.RECENTLY_PLAYED)
  })

  it('CONFIRMED for a gig still to come, ahead of every later gate', () => {
    expect(classifyBooking(row({ 'Last played': '01.12.25' }), TODAY)).toBe(STATUS.CONFIRMED)
    expect(classifyBooking(row({ 'Last played': '16.06.25', Note: 'anrufen', Type: 'festival' }), TODAY)).toBe(STATUS.CONFIRMED)
    // A gig on "today" itself has started — recently played, as replyHealth says.
    expect(classifyBooking(row({ 'Last played': '15.06.25' }), TODAY)).toBe(STATUS.RECENTLY_PLAYED)
    // Still out of the send lists, as before.
    expect(classifyBooking({ Venue: 'V', Band: '', Email: 'a@b.cc', 'Last played': '01.12.25' }, TODAY)).toBe(STATUS.MISSING_INFO)
  })

  it('ON_HOLD on a hold keyword, unless the hold has expired', () => {
    expect(classifyBooking(row({ Note: 'Bitte erst nächstes Jahr anrufen' }), TODAY)).toBe(STATUS.ON_HOLD)
    // Emailed >= 365 days ago → the hold expires and the trunk continues.
    expect(classifyBooking(row({ Note: 'anrufen', 'Last emailed': '01.01.24' }), TODAY)).toBe(STATUS.SEND)
  })

  it('hold keywords match case-insensitively', () => {
    expect(classifyBooking(row({ Note: 'WARTEN bitte' }), TODAY)).toBe(STATUS.ON_HOLD)
  })

  it('FESTIVAL_INELIGIBLE while the festival month sits in the dead zone', () => {
    // August 2025 is ~2 months out → inside [−2, +3] months → window closed.
    expect(classifyBooking(row({ Type: 'festival', 'Time Frame': 'August' }), TODAY)).toBe(STATUS.FESTIVAL_INELIGIBLE)
    // December is >3 months out and >2 months past → window open.
    expect(classifyBooking(row({ Type: 'festival', 'Time Frame': 'Dezember' }), TODAY)).toBe(STATUS.NEVER_CONTACTED)
    // No parsable month → treated as "not in the window" → ineligible.
    expect(classifyBooking(row({ Type: 'festival', 'Time Frame': '' }), TODAY)).toBe(STATUS.FESTIVAL_INELIGIBLE)
  })

  it('a fulfilled follow-up falls back to the recency split', () => {
    // Follow-up 01.05.25, emailed after it and within 30 days → recent.
    expect(classifyBooking(row({ 'Follow Up Date': '01.05.25', 'Last emailed': '01.06.25' }), TODAY)).toBe(STATUS.RECENT_CONTACT)
    // Emailed after it but long ago → send again.
    expect(classifyBooking(row({ 'Follow Up Date': '01.01.25', 'Last emailed': '02.01.25' }), TODAY)).toBe(STATUS.SEND)
  })

  it('FOLLOW_UP_DUE / FOLLOW_UP_PENDING around today', () => {
    expect(classifyBooking(row({ 'Follow Up Date': '01.06.25' }), TODAY)).toBe(STATUS.FOLLOW_UP_DUE)
    expect(classifyBooking(row({ 'Follow Up Date': '01.08.25' }), TODAY)).toBe(STATUS.FOLLOW_UP_PENDING)
  })

  it('NEVER_CONTACTED with no dates at all', () => {
    expect(classifyBooking(row(), TODAY)).toBe(STATUS.NEVER_CONTACTED)
  })

  it('RECENT_CONTACT / SEND across the default 30-day frequency', () => {
    expect(classifyBooking(row({ 'Last emailed': '01.06.25' }), TODAY)).toBe(STATUS.RECENT_CONTACT)
    expect(classifyBooking(row({ 'Last emailed': '01.04.25' }), TODAY)).toBe(STATUS.SEND)
  })

  it('honours a per-venue Frequency over the default', () => {
    // 45 days ago with a 3-month frequency is still recent.
    expect(classifyBooking(row({ 'Last emailed': '01.05.25', frequency: '3 months' }), TODAY)).toBe(STATUS.RECENT_CONTACT)
    // …but not with a 7-day one.
    expect(classifyBooking(row({ 'Last emailed': '01.05.25', frequency: '7 days' }), TODAY)).toBe(STATUS.SEND)
  })
})

describe('classifyBooking — behaviour flips with custom rules', () => {
  it('recentlyPlayedDays: 100 lets an older gig through', () => {
    const r = row({ 'Last played': '01.01.25' }) // ~165 days before TODAY
    expect(classifyBooking(r, TODAY)).toBe(STATUS.RECENTLY_PLAYED)
    const rules = mergeRules({ ...DEFAULT_RULES, recentlyPlayedDays: 100 })
    expect(classifyBooking(r, TODAY, rules)).toBe(STATUS.NEVER_CONTACTED)
  })

  it("holdKeywords: ['xyz'] replaces the whole list", () => {
    const rules = mergeRules({ ...DEFAULT_RULES, holdKeywords: ['xyz'] })
    expect(classifyBooking(row({ Note: 'anrufen' }), TODAY, rules)).toBe(STATUS.NEVER_CONTACTED)
    expect(classifyBooking(row({ Note: 'call me on XYZ' }), TODAY, rules)).toBe(STATUS.ON_HOLD)
  })

  it('festivalFutureMonths: 6 widens the dead zone', () => {
    const r = row({ Type: 'festival', 'Time Frame': 'November' })
    // November 2025 is ~5 months out → outside the default +3 window → eligible.
    expect(classifyBooking(r, TODAY)).toBe(STATUS.NEVER_CONTACTED)
    const rules = mergeRules({ ...DEFAULT_RULES, festivalFutureMonths: 6 })
    expect(classifyBooking(r, TODAY, rules)).toBe(STATUS.FESTIVAL_INELIGIBLE)
  })

  it('holdOverrideDays: 30 expires a hold much sooner', () => {
    const r = row({ Note: 'warten', 'Last emailed': '01.03.25' })
    expect(classifyBooking(r, TODAY)).toBe(STATUS.ON_HOLD)
    const rules = mergeRules({ ...DEFAULT_RULES, holdOverrideDays: 30 })
    expect(classifyBooking(r, TODAY, rules)).toBe(STATUS.SEND)
  })

  it('defaultFrequencyDays: 180 keeps an old email "recent"', () => {
    const r = row({ 'Last emailed': '01.04.25' })
    expect(classifyBooking(r, TODAY)).toBe(STATUS.SEND)
    const rules = mergeRules({ ...DEFAULT_RULES, defaultFrequencyDays: 180 })
    expect(classifyBooking(r, TODAY, rules)).toBe(STATUS.RECENT_CONTACT)
  })
})

describe('filler venues', () => {
  const filler = (Band, extra = {}) => row({ Type: 'filler', Band, ...extra })
  const ctx = { typeRules: normalizeTypeRules(undefined, ['Alpha']) }

  it('are out of outreach for a band that does not book fillers', () => {
    expect(classifyBooking(filler('Beta'), TODAY, undefined, ctx)).toBe(STATUS.FILLER_OFF)
    expect(classifyBooking(filler('Beta', { 'Last emailed': '01.01.24' }), TODAY, undefined, ctx)).toBe(STATUS.FILLER_OFF)
  })

  it('classify normally for a band that does — case and spacing of the name do not matter', () => {
    expect(classifyBooking(filler(' ALPHA '), TODAY, undefined, ctx)).toBe(STATUS.NEVER_CONTACTED)
    expect(classifyBooking(filler('Alpha', { 'Last emailed': '01.01.24' }), TODAY, undefined, ctx)).toBe(STATUS.SEND)
  })

  it('without band settings, no band books fillers', () => {
    expect(classifyBooking(filler('Alpha'), TODAY)).toBe(STATUS.FILLER_OFF)
  })

  it('a dead venue stays dead, and other types ignore the filler setting', () => {
    expect(classifyBooking(row({ Type: 'dead', Band: 'Beta' }), TODAY, undefined, ctx)).toBe(STATUS.DEAD)
    expect(classifyBooking(row({ Type: 'main', Band: 'Beta' }), TODAY, undefined, ctx)).toBe(STATUS.NEVER_CONTACTED)
  })
})

describe('venue-type rules', () => {
  const rules = (patches) => Object.entries(patches).reduce((acc, [t, p]) => setTypeRule(acc, t, p), normalizeTypeRules(undefined))

  it('any type can be never contacted, or follow the festival window', () => {
    const ctx = { typeRules: rules({ closed: { behaves: 'never' }, openair: { behaves: 'festival' } }) }
    expect(classifyBooking(row({ Type: 'Closed' }), TODAY, undefined, ctx)).toBe(STATUS.DEAD)
    expect(classifyBooking(row({ Type: 'openair', 'Time Frame': 'August' }), TODAY, undefined, ctx)).toBe(STATUS.FESTIVAL_INELIGIBLE)
  })

  it('a type with the defaults moved away behaves ordinarily', () => {
    const ctx = { typeRules: rules({ dead: { behaves: 'normal' } }) }
    expect(classifyBooking(row({ Type: 'dead' }), TODAY, undefined, ctx)).toBe(STATUS.NEVER_CONTACTED)
  })

  it('restricts a type to some bands', () => {
    const ctx = { typeRules: rules({ jazzclub: { bands: ['Trio'] } }) }
    expect(classifyBooking(row({ Type: 'jazzclub', Band: 'Trio' }), TODAY, undefined, ctx)).toBe(STATUS.NEVER_CONTACTED)
    expect(classifyBooking(row({ Type: 'jazzclub', Band: 'Big Band' }), TODAY, undefined, ctx)).toBe(STATUS.FILLER_OFF)
  })

  it('a type interval stands in for the default, the venue’s own Frequency still wins', () => {
    const ctx = { typeRules: rules({ main: { frequencyDays: 90 } }) }
    const r = row({ Type: 'main', 'Last emailed': '01.04.25' }) // 75 days ago
    expect(classifyBooking(r, TODAY)).toBe(STATUS.SEND)
    expect(classifyBooking(r, TODAY, undefined, ctx)).toBe(STATUS.RECENT_CONTACT)
    expect(classifyBooking({ ...r, frequency: '1 month' }, TODAY, undefined, ctx)).toBe(STATUS.SEND)
  })
})

describe('missing info', () => {
  it('needs a real email address, but an online form is not missing one', () => {
    expect(classifyBooking(row({ Email: 'tbd' }), TODAY)).toBe(STATUS.MISSING_INFO)
    expect(classifyBooking(row({ Email: 'info@club.de, booking@club.de' }), TODAY)).toBe(STATUS.NEVER_CONTACTED)
    expect(classifyBooking(row({ Email: 'online form only' }), TODAY)).toBe(STATUS.NEVER_CONTACTED)
  })

  it('needs Dates — the venue’s own or its band’s — and a template for the band', () => {
    const settings = { bands: [{ name: 'The Band', tourDates: 'May 2026' }, { name: 'Other' }] }
    const ctx = classifyContext(settings, [{ band: 'The Band', language: 'en' }])
    expect(classifyBooking(row(), TODAY, undefined, ctx)).toBe(STATUS.NEVER_CONTACTED)
    expect(classifyBooking(row({ Band: 'Other' }), TODAY, undefined, ctx)).toBe(STATUS.MISSING_INFO)
    // Dates of its own are enough, but Other still has no template.
    expect(classifyBooking(row({ Band: 'Other', Dates: 'June' }), TODAY, undefined, ctx)).toBe(STATUS.MISSING_INFO)
    // Without templates (web) only the Dates count.
    expect(classifyBooking(row({ Band: 'Other', Dates: 'June' }), TODAY, undefined, classifyContext(settings))).toBe(STATUS.NEVER_CONTACTED)
  })
})
