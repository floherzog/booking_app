import { DEFAULT_RULES } from './rules.js'
import { DEFAULT_TYPE_RULES, typesWith } from './venueTypes.js'
import { plainT } from './tr.js'

// The three gates that read a venue's Type. Each lists the types it applies to;
// in Settings ▸ Rules ▸ Flow those lists are dropdowns that edit the types'
// rules (settings.venueTypeRules).
export const TYPE_GATES = {
  never: { test: r => r.behaves === 'never', add: { behaves: 'never' }, remove: { behaves: 'normal' } },
  bands: { test: r => r.bands !== null, add: { bands: [] }, remove: { bands: null } },
  festival: { test: r => r.behaves === 'festival', add: { behaves: 'festival' }, remove: { behaves: 'normal' } },
}
export function gateTypes(typeRules, gate) {
  return typesWith(typeRules, TYPE_GATES[gate].test)
}
const quoted = (types, t) => types.length ? types.map(x => `"${x}"`).join(` ${t('or')} `) : t('(none)')

// The decision tree LogicModal draws, built from the active rules instead of
// hand-written prose. Mirrors classifyBooking() in classify.js, in evaluation
// order. Each node is a gate (orange trunk): if it matches, the venue gets the
// status on the "yes" branch; otherwise the trunk continues to the next gate
// ("no"). Some gates open a small sub-decision before reaching an outcome.
// `t` translates (tr.js).
export function buildLogicNodes(rules = DEFAULT_RULES, typeRules = DEFAULT_TYPE_RULES, t = plainT) {
  // The full list, not a preview: a keyword you added yourself must be visible
  // here, and the modal scrolls anyway.
  const keywordList = rules.holdKeywords.join(' · ')
  const typesQ = (gate, rest) => `${t('Type is {types}', { types: quoted(gateTypes(typeRules, gate), t) })}${rest ? ` ${rest}` : ''}`
  const bandsRest = t('and the band isn’t one that books it')
  const windowRest = t('and the booking window is closed')

  return [
    {
      col: t('Type'), q: typesQ('never'), yes: 'DEAD',
      gate: 'never', types: gateTypes(typeRules, 'never'), rest: '',
    },
    {
      col: t('Type + Band'), q: typesQ('bands', bandsRest), yes: 'FILLER_OFF',
      gate: 'bands', types: gateTypes(typeRules, 'bands'), rest: bandsRest,
      note: t('Settings ▸ Venue types ▸ “Booked by” decides which bands book each type.'),
    },
    {
      col: t('Required fields'), q: t('Missing Venue, Band, a real email address, Dates, or a template for the band'), yes: 'MISSING_INFO',
      note: t('Dates count when the venue or its band has them. Hidden from every send/follow-up list until the red “!” is fixed.'),
    },
    {
      col: t('Last Played'), q: t('Last Played is a date still to come'), yes: 'CONFIRMED',
      note: t('A confirmed gig — not an outreach target right now.'),
    },
    {
      col: t('Last Played'), q: t('Played within the last {days} days', { days: rules.recentlyPlayedDays }), yes: 'RECENTLY_PLAYED',
      note: t('A recent gig — not an outreach target right now.'),
    },
    {
      col: t('Note'), q: t('Note contains a hold keyword'),
      note: keywordList,
      sub: {
        q: t('Last emailed ≥ {days} days ago?', { days: rules.holdOverrideDays }),
        yes: { fall: t('hold expired — keep going') },
        no: 'ON_HOLD',
      },
    },
    {
      col: t('Type + Time Frame'), q: typesQ('festival', windowRest), yes: 'FESTIVAL_INELIGIBLE',
      gate: 'festival', types: gateTypes(typeRules, 'festival'), rest: windowRest,
      note: t('The window is open only when the festival month is still >{future} months out or already >{past} months past.', { future: rules.festivalFutureMonths, past: rules.festivalPastMonths }),
    },
    {
      col: t('Follow Up + Last Emailed'), q: t('Follow-up date set AND already emailed on/after it'),
      note: t('Follow-up is fulfilled — fall back to the normal recency split.'),
      sub: { q: t('Last emailed within the follow-up window?'), yes: 'RECENT_CONTACT', no: 'SEND' },
    },
    {
      col: t('Follow Up Date'), q: t('Follow-up date set (and not yet fulfilled)'),
      sub: { q: t('Is it today or earlier?'), yes: 'FOLLOW_UP_DUE', no: 'FOLLOW_UP_PENDING' },
    },
    { col: t('Last Emailed'), q: t('Never emailed'), yes: 'NEVER_CONTACTED' },
    {
      col: t('Last Emailed'), q: t('Otherwise: last emailed within the follow-up window'), terminal: true,
      yes: 'RECENT_CONTACT', no: 'SEND',
    },
  ]
}

// The follow-up window note shown in the modal footer.
export function describeWindow(rules = DEFAULT_RULES, t = plainT) {
  return t('Follow-up window = the venue’s Follow-up Interval, else its type’s, else {days} days.', { days: rules.defaultFrequencyDays })
}

// How the next batch is picked, in one line.
export function describeBatchRule(rules = DEFAULT_RULES, t = plainT) {
  const keys = rules.batchSortKeys?.length ? rules.batchSortKeys : DEFAULT_RULES.batchSortKeys
  return t('Next batch = the first {n} action-needed venues, sorted by {columns}.', { n: rules.batchSize, columns: keys.join(' → ') })
}
