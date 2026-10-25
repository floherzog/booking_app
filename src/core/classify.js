import { differenceInDays, addMonths, subMonths } from 'date-fns'
import { STATUS, isSendBlocked, frequencyToDays } from './constants.js'
import { DEFAULT_RULES } from './rules.js'
import { parseDate, parseMonthsFromTimeFrame } from './parseDate.js'

function hasHoldKeyword(note, rules) {
  if (!note) return false
  const lower = note.toLowerCase()
  return rules.holdKeywords.some(kw => lower.includes(kw))
}

function festivalInWindow(timeFrame, today, rules) {
  const months = parseMonthsFromTimeFrame(timeFrame)
  if (months.length === 0) return false
  const futureLimit = addMonths(today, rules.festivalFutureMonths)
  const pastLimit = subMonths(today, rules.festivalPastMonths)
  // The booking window is CLOSED when the nearest occurrence of the festival's
  // month falls in the dead zone [festivalPastMonths past, festivalFutureMonths
  // future] — too close to book. It's open (eligible) only when no occurrence
  // lands in that zone.
  return !months.some(m => {
    const candidates = [
      new Date(today.getFullYear() - 1, m, 1),
      new Date(today.getFullYear(), m, 1),
      new Date(today.getFullYear() + 1, m, 1),
    ]
    return candidates.some(d => d >= pastLimit && d <= futureLimit)
  })
}

// `ctx.fillerBands`: lower-cased names of the bands with "Book filler venues"
// switched on (Settings ▸ Bands). A venue of Type "filler" only enters the
// outreach lists for those bands; without the set, no band books fillers.
export function classifyBooking(row, today, rules = DEFAULT_RULES, ctx = {}) {
  const type = (row['Type'] || '').toLowerCase().trim()
  const note = row['Note'] || ''
  const followUpRaw = row['Follow Up Date'] || ''
  const lastEmailedRaw = row['Last emailed'] || ''
  const timeFrame = row['Time Frame'] || ''

  if (type === 'dead') return STATUS.DEAD

  if (type === 'filler' && !ctx.fillerBands?.has(String(row['Band'] || '').trim().toLowerCase())) {
    return STATUS.FILLER_OFF
  }

  // Missing a field required to send (venue/band/email) → keep out of every
  // send/follow-up list; the red "!" flag is enough of a prompt to fix it.
  if (isSendBlocked(row)) return STATUS.MISSING_INFO

  // A gig still to come, or one played recently → not for booking outreach
  // right now. Mirrors the next-batch policy. "Still to come" is the same test
  // as replyHealth's 'gig'.
  const lastPlayed = parseDate(row['Last played'] || '')
  if (lastPlayed && lastPlayed > today) return STATUS.CONFIRMED
  if (lastPlayed && differenceInDays(today, lastPlayed) < rules.recentlyPlayedDays) return STATUS.RECENTLY_PLAYED

  const lastEmailed = parseDate(lastEmailedRaw)
  // Per-venue re-contact window (Frequency column), defaulting to the rules'
  // defaultFrequencyDays.
  const freqDays = frequencyToDays(row['frequency'], rules)

  if (hasHoldKeyword(note, rules)) {
    const holdExpired = lastEmailed && differenceInDays(today, lastEmailed) >= rules.holdOverrideDays
    if (!holdExpired) return STATUS.ON_HOLD
  }

  if (type === 'festival') {
    if (!festivalInWindow(timeFrame, today, rules)) return STATUS.FESTIVAL_INELIGIBLE
  }

  const followUpDate = parseDate(followUpRaw)

  // Stale follow-up: emailed on or after the follow-up date → follow-up is fulfilled
  if (followUpDate && lastEmailed && lastEmailed >= followUpDate) {
    const daysAgo = differenceInDays(today, lastEmailed)
    return daysAgo <= freqDays ? STATUS.RECENT_CONTACT : STATUS.SEND
  }

  if (followUpDate) {
    return followUpDate <= today ? STATUS.FOLLOW_UP_DUE : STATUS.FOLLOW_UP_PENDING
  }

  if (!lastEmailed) return STATUS.NEVER_CONTACTED

  const daysAgo = differenceInDays(today, lastEmailed)
  return daysAgo <= freqDays ? STATUS.RECENT_CONTACT : STATUS.SEND
}
