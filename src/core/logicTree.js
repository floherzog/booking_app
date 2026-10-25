import { DEFAULT_RULES } from './rules.js'

// The decision tree LogicModal draws, built from the active rules instead of
// hand-written prose. Mirrors classifyBooking() in classify.js, in evaluation
// order. Each node is a gate (orange trunk): if it matches, the venue gets the
// status on the "yes" branch; otherwise the trunk continues to the next gate
// ("no"). Some gates open a small sub-decision before reaching an outcome.
export function buildLogicNodes(rules = DEFAULT_RULES) {
  // The full list, not a preview: a keyword you added yourself must be visible
  // here, and the modal scrolls anyway.
  const keywordList = rules.holdKeywords.join(' · ')

  return [
    { col: 'Type', q: 'Type is "dead"', yes: 'DEAD' },
    {
      col: 'Type + Band', q: 'Type is "filler" and the band does not book filler venues', yes: 'FILLER_OFF',
      note: 'Settings ▸ Bands ▸ "Book filler venues" decides, per band.',
    },
    {
      col: 'Required fields', q: 'Missing Venue, Band, or Email', yes: 'MISSING_INFO',
      note: 'Hidden from every send/follow-up list until the flagged fields are filled in.',
    },
    {
      col: 'Last Played', q: 'Last Played is a date still to come', yes: 'CONFIRMED',
      note: 'A confirmed gig — not an outreach target right now.',
    },
    {
      col: 'Last Played', q: `Played within the last ${rules.recentlyPlayedDays} days`, yes: 'RECENTLY_PLAYED',
      note: 'A recent gig — not an outreach target right now.',
    },
    {
      col: 'Note', q: 'Note contains a hold keyword',
      note: keywordList,
      sub: {
        q: `Last emailed ≥ ${rules.holdOverrideDays} days ago?`,
        yes: { fall: 'hold expired — keep going' },
        no: 'ON_HOLD',
      },
    },
    {
      col: 'Type + Time Frame', q: 'Type is "festival" and the booking window is closed', yes: 'FESTIVAL_INELIGIBLE',
      note: `The window is open only when the festival month is still >${rules.festivalFutureMonths} months out or already >${rules.festivalPastMonths} months past.`,
    },
    {
      col: 'Follow Up + Last Emailed', q: 'Follow-up date set AND already emailed on/after it',
      note: 'Follow-up is fulfilled — fall back to the normal recency split.',
      sub: { q: 'Last emailed within the follow-up window?', yes: 'RECENT_CONTACT', no: 'SEND' },
    },
    {
      col: 'Follow Up Date', q: 'Follow-up date set (and not yet fulfilled)',
      sub: { q: 'Is it today or earlier?', yes: 'FOLLOW_UP_DUE', no: 'FOLLOW_UP_PENDING' },
    },
    { col: 'Last Emailed', q: 'Never emailed', yes: 'NEVER_CONTACTED' },
    {
      col: 'Last Emailed', q: 'Otherwise: last emailed within the follow-up window', terminal: true,
      yes: 'RECENT_CONTACT', no: 'SEND',
    },
  ]
}

// The follow-up window note shown in the modal footer.
export function describeWindow(rules = DEFAULT_RULES) {
  return `Follow-up window = the venue’s Frequency setting (default ${rules.defaultFrequencyDays} days).`
}

// How the next batch is picked, in one line.
export function describeBatchRule(rules = DEFAULT_RULES) {
  const keys = rules.batchSortKeys?.length ? rules.batchSortKeys : DEFAULT_RULES.batchSortKeys
  return `Next batch = the first ${rules.batchSize} action-needed venues, sorted by ${keys.join(' → ')}.`
}
