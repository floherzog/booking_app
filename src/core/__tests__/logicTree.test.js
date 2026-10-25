import { describe, it, expect } from 'vitest'
import { buildLogicNodes, describeWindow, describeBatchRule } from '@core/logicTree'
import { describeStatus } from '@core/constants'
import { STATUS } from '@core/constants'
import { DEFAULT_RULES, mergeRules } from '@core/rules'

describe('buildLogicNodes', () => {
  it('matches classifyBooking gate-for-gate, in order', () => {
    const nodes = buildLogicNodes()
    expect(nodes).toHaveLength(11)
    expect(nodes[0].yes).toBe('DEAD')
    expect(nodes[1].yes).toBe('FILLER_OFF')
    expect(nodes[2].yes).toBe('MISSING_INFO')
    expect(nodes[3].yes).toBe('CONFIRMED')
    expect(nodes[4].yes).toBe('RECENTLY_PLAYED')
    expect(nodes[5].sub.no).toBe('ON_HOLD')
    expect(nodes[6].yes).toBe('FESTIVAL_INELIGIBLE')
    expect(nodes[9].yes).toBe('NEVER_CONTACTED')
    expect(nodes[10].terminal).toBe(true)
  })

  it('interpolates the default rule values', () => {
    const nodes = buildLogicNodes()
    expect(nodes[4].q).toContain('365 days')
    expect(nodes[5].sub.q).toContain('365 days')
    expect(nodes[6].note).toContain('>3 months out')
    expect(nodes[6].note).toContain('>2 months past')
    expect(nodes[5].note).toContain('anrufen')
  })

  it('re-interpolates when the rules change', () => {
    const rules = mergeRules({
      ...DEFAULT_RULES,
      recentlyPlayedDays: 100,
      holdOverrideDays: 30,
      festivalFutureMonths: 6,
      festivalPastMonths: 1,
      holdKeywords: ['xyz'],
    })
    const nodes = buildLogicNodes(rules)
    expect(nodes[4].q).toContain('100 days')
    expect(nodes[5].sub.q).toContain('30 days')
    expect(nodes[5].note).toBe('xyz')
    expect(nodes[6].note).toContain('>6 months out')
    expect(nodes[6].note).toContain('>1 months past')
  })
})

describe('rule summaries', () => {
  it('describes the follow-up window from the rules', () => {
    expect(describeWindow()).toContain('30 days')
    expect(describeWindow(mergeRules({ defaultFrequencyDays: 45 }))).toContain('45 days')
  })

  it('describes the batch rule from the rules', () => {
    expect(describeBatchRule()).toContain('first 10')
    expect(describeBatchRule()).toContain('Country → City → Venue')
    const custom = mergeRules({ batchSize: 3, batchSortKeys: ['Venue'] })
    expect(describeBatchRule(custom)).toContain('first 3')
    expect(describeBatchRule(custom)).toContain('sorted by Venue')
  })
})

describe('describeStatus', () => {
  it('reads its numbers from the rules', () => {
    expect(describeStatus(STATUS.RECENTLY_PLAYED)).toContain('365 days')
    expect(describeStatus(STATUS.RECENTLY_PLAYED, mergeRules({ recentlyPlayedDays: 100 }))).toContain('100 days')
    expect(describeStatus(STATUS.FESTIVAL_INELIGIBLE)).toContain('3 months out')
    expect(describeStatus(STATUS.SEND)).toContain('30 days')
  })

  it('returns an empty string for an unknown status', () => {
    expect(describeStatus('NOPE')).toBe('')
  })
})
