import { differenceInDays, addMonths, subMonths } from 'date-fns'
import { STATUS, isSendBlocked, frequencyToDays } from './constants.js'
import { DEFAULT_TYPE_RULES, typeRuleFor, bandBooksType } from './venueTypes.js'
import { bandsWithDatesSet } from './bands.js'
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

// What classifyBooking needs to know beyond the row and the rules, built once
// from the settings (and, on the Mac, the mail templates):
//   typeRules           settings.venueTypeRules — what each venue type does
//   bandsWithDates      bands whose Dates are set
//   bandsWithTemplates  bands with at least one mail template; leave
//                       `templates` out (web, not loaded yet) to skip the check
export function classifyContext(settings, templates) {
  return {
    typeRules: settings?.venueTypeRules || DEFAULT_TYPE_RULES,
    bandsWithDates: bandsWithDatesSet(settings?.bands),
    bandsWithTemplates: templates
      ? new Set(templates.map(t => String(t?.band || '').trim().toLowerCase()).filter(Boolean))
      : null,
  }
}

// A key that changes exactly when the context would classify differently, so
// App only reclassifies on a real change.
export function classifyContextKey(ctx) {
  return JSON.stringify([
    ctx.typeRules,
    [...(ctx.bandsWithDates || [])].sort(),
    ctx.bandsWithTemplates ? [...ctx.bandsWithTemplates].sort() : null,
  ])
}

export function classifyBooking(row, today, rules = DEFAULT_RULES, ctx = {}) {
  const type = (row['Type'] || '').toLowerCase().trim()
  const note = row['Note'] || ''
  const followUpRaw = row['Follow Up Date'] || ''
  const lastEmailedRaw = row['Last emailed'] || ''
  const timeFrame = row['Time Frame'] || ''
  const typeRules = ctx.typeRules || DEFAULT_TYPE_RULES
  const typeRule = typeRuleFor(typeRules, type)

  if (type && typeRule.behaves === 'never') return STATUS.DEAD

  if (type && !bandBooksType(typeRules, type, row['Band'])) return STATUS.FILLER_OFF

  // Can't be emailed (no venue/band/real address, or the band has no Dates or
  // template) → keep out of every send/follow-up list; the red "!" flag says why.
  if (isSendBlocked(row, ctx)) return STATUS.MISSING_INFO

  // A gig still to come, or one played recently → not for booking outreach
  // right now. Mirrors the next-batch policy. "Still to come" is the same test
  // as replyHealth's 'gig'.
  const lastPlayed = parseDate(row['Last played'] || '')
  if (lastPlayed && lastPlayed > today) return STATUS.CONFIRMED
  if (lastPlayed && differenceInDays(today, lastPlayed) < rules.recentlyPlayedDays) return STATUS.RECENTLY_PLAYED

  const lastEmailed = parseDate(lastEmailedRaw)
  // Re-contact window: the venue's own Frequency, else its type's interval,
  // else the rules' defaultFrequencyDays.
  const freqDays = frequencyToDays(row['frequency'], typeRule.frequencyDays
    ? { ...rules, defaultFrequencyDays: typeRule.frequencyDays }
    : rules)

  if (hasHoldKeyword(note, rules)) {
    const holdExpired = lastEmailed && differenceInDays(today, lastEmailed) >= rules.holdOverrideDays
    if (!holdExpired) return STATUS.ON_HOLD
  }

  if (type && typeRule.behaves === 'festival') {
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
