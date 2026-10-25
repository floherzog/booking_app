import { describe, it, expect } from 'vitest'
import { lastEmailedColor, followUpColor, lastPlayedColor, lastReplyColor } from '@core/dateColors'
import { STATUS } from '@core/constants'
import { mergeRules } from '@core/rules'

// Colors are computed against "now", so build dates relative to it.
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

describe('lastEmailedColor', () => {
  const row = { _status: STATUS.SEND }

  it('walks green → yellow → orange → red across the frequency window', () => {
    expect(lastEmailedColor(daysAgo(5), row)).toBe('text-green-500')
    expect(lastEmailedColor(daysAgo(25), row)).toBe('text-yellow-500')
    expect(lastEmailedColor(daysAgo(45), row)).toBe('text-orange-500')
    expect(lastEmailedColor(daysAgo(100), row)).toBe('text-red-500')
  })

  it('shifts with a custom defaultFrequencyDays', () => {
    const rules = mergeRules({ defaultFrequencyDays: 180 })
    expect(lastEmailedColor(daysAgo(45), row, rules)).toBe('text-green-500')
  })

  it('stays gray for statuses where re-emailing is not the concern', () => {
    expect(lastEmailedColor(daysAgo(400), { _status: STATUS.ON_HOLD })).toBe('text-gray-400')
  })
})

describe('followUpColor keeps the differenceInDays sign semantics', () => {
  it('treats future dates as negative for a pending follow-up', () => {
    // 30 days in the future → more than 14 days out → green.
    expect(followUpColor(daysAgo(-30), { _status: STATUS.FOLLOW_UP_PENDING })).toBe('text-green-500')
    // 3 days out → still yellow.
    expect(followUpColor(daysAgo(-3), { _status: STATUS.FOLLOW_UP_PENDING })).toBe('text-yellow-500')
  })

  it('turns red only once a due follow-up is properly overdue', () => {
    expect(followUpColor(daysAgo(3), { _status: STATUS.FOLLOW_UP_DUE })).toBe('text-orange-500')
    expect(followUpColor(daysAgo(30), { _status: STATUS.FOLLOW_UP_DUE })).toBe('text-red-500')
  })

  it('honours a custom followUpDueRedAfterDays', () => {
    const rules = mergeRules({ dateColors: { followUpDueRedAfterDays: 1 } })
    expect(followUpColor(daysAgo(3), { _status: STATUS.FOLLOW_UP_DUE }, rules)).toBe('text-red-500')
  })

  it('stays gray for a resolved status', () => {
    expect(followUpColor(daysAgo(300), { _status: STATUS.RECENT_CONTACT })).toBe('text-gray-400')
  })
})

describe('lastPlayedColor / lastReplyColor', () => {
  it('use their rule thresholds', () => {
    expect(lastPlayedColor(daysAgo(30))).toBe('text-red-500')
    // A confirmed gig still to come is good news.
    expect(lastPlayedColor(daysAgo(-30))).toBe('text-green-500')
    expect(lastPlayedColor(daysAgo(200))).toBe('text-orange-500')
    expect(lastPlayedColor(daysAgo(400))).toBe('text-green-500')
    expect(lastPlayedColor(daysAgo(200), null, mergeRules({ dateColors: { lastPlayedRedDays: 300 } }))).toBe('text-red-500')
    // Called the way RelDate calls every colour function — (date, row, rules).
    // A row in the second slot used to be read as the rules and threw.
    expect(lastPlayedColor(daysAgo(30), { Venue: 'X', 'Last played': '01.01.26' })).toBe('text-red-500')
    expect(lastReplyColor(daysAgo(60), { Venue: 'X' }, mergeRules({ dateColors: { lastReplyGreenDays: 90, lastReplyLimeDays: 120 } }))).toBe('text-green-500')

    expect(lastReplyColor(daysAgo(10))).toBe('text-green-500')
    expect(lastReplyColor(daysAgo(60))).toBe('text-lime-500')
    expect(lastReplyColor(daysAgo(200))).toBe('text-orange-500')
    expect(lastReplyColor(daysAgo(500))).toBe('text-gray-400')
  })
})
