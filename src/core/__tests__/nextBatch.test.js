import { describe, it, expect } from 'vitest'
import { computeNextBatch, explainEmptyBatch } from '@core/nextBatch'
import { STATUS } from '@core/constants'
import { DEFAULT_RULES, mergeRules } from '@core/rules'

const TODAY = new Date(2025, 5, 15)

function actionable(idx, extra = {}) {
  return { _idx: idx, _status: STATUS.SEND, Country: 'DE', City: 'Berlin', Venue: `V${idx}`, ...extra }
}

describe('computeNextBatch', () => {
  it('takes the first batchSize actionable rows', () => {
    const rows = Array.from({ length: 25 }, (_, i) => actionable(i, { Venue: `V${String(i).padStart(2, '0')}` }))
    expect(computeNextBatch(rows, TODAY).size).toBe(DEFAULT_RULES.batchSize)
    expect(computeNextBatch(rows, TODAY, mergeRules({ ...DEFAULT_RULES, batchSize: 3 })).size).toBe(3)
  })

  it('only considers action statuses', () => {
    const rows = [
      actionable(0),
      { _idx: 1, _status: STATUS.RECENT_CONTACT, Country: 'AT', City: 'Wien', Venue: 'A' },
      { _idx: 2, _status: STATUS.FOLLOW_UP_DUE, Country: 'AT', City: 'Wien', Venue: 'B' },
      { _idx: 3, _status: STATUS.NEVER_CONTACTED, Country: 'AT', City: 'Wien', Venue: 'C' },
      { _idx: 4, _status: STATUS.ON_HOLD, Country: 'AT', City: 'Wien', Venue: 'D' },
    ]
    expect([...computeNextBatch(rows, TODAY)].sort()).toEqual([0, 2, 3])
  })

  it('sorts by batchSortKeys in order', () => {
    const rows = [
      actionable(0, { Country: 'DE', City: 'Berlin', Venue: 'Zeta' }),
      actionable(1, { Country: 'AT', City: 'Wien', Venue: 'Alpha' }),
      actionable(2, { Country: 'DE', City: 'Aachen', Venue: 'Beta' }),
    ]
    const rules = mergeRules({ ...DEFAULT_RULES, batchSize: 2 })
    // Country → City → Venue: AT/Wien first, then DE/Aachen.
    expect([...computeNextBatch(rows, TODAY, rules)]).toEqual([1, 2])
    // Sorting by Venue alone flips the order.
    const byVenue = mergeRules({ ...DEFAULT_RULES, batchSize: 2, batchSortKeys: ['Venue'] })
    expect([...computeNextBatch(rows, TODAY, byVenue)]).toEqual([1, 2])
    const byVenueDesc = mergeRules({ ...DEFAULT_RULES, batchSize: 1, batchSortKeys: ['City'] })
    expect([...computeNextBatch(rows, TODAY, byVenueDesc)]).toEqual([2]) // Aachen
  })
})

describe('explainEmptyBatch', () => {
  const rule = (o = {}) => mergeRules({ ...DEFAULT_RULES, ...o })

  it('points at the batch size when it is 0', () => {
    const r = explainEmptyBatch({ rows: [actionable(0)], filters: { nextBatch: true }, rules: rule({ batchSize: 0 }), today: TODAY })
    expect(r.action).toBe('rules')
  })

  it('says when other filters hide the batch', () => {
    const rows = [{ ...actionable(0, { Band: 'A' }), _nextBatch: true }]
    const r = explainEmptyBatch({ rows, filters: { nextBatch: true, band: 'B' }, rules: rule(), today: TODAY })
    expect(r.action).toBe('onlyBatch')
    expect(r.reason).toContain('Band: B')
    expect(r.reason).toContain('1 venue')
  })

  it('is null when the batch does show', () => {
    const rows = [{ ...actionable(0), _nextBatch: true }]
    expect(explainEmptyBatch({ rows, filters: { nextBatch: true }, rules: rule(), today: TODAY })).toBeNull()
  })

  it('with nothing to do: who is waiting, the next follow-up, and the venues missing info', () => {
    const rows = [
      { _idx: 0, _status: STATUS.FOLLOW_UP_PENDING, Venue: 'Moods', 'Follow Up Date': '20.07.25' },
      { _idx: 1, _status: STATUS.RECENT_CONTACT, Venue: 'Kulak', 'Follow Up Date': '01.07.25' },
      { _idx: 2, _status: STATUS.MISSING_INFO, Venue: 'X', 'Follow Up Date': '16.06.25' },
      { _idx: 3, _status: STATUS.ON_HOLD, Venue: 'Old', 'Follow Up Date': '01.01.25' },
    ]
    const r = explainEmptyBatch({ rows, filters: { nextBatch: true }, rules: rule(), today: TODAY })
    expect(r.reason).toBe('No venue needs contacting right now — 2 venues are waiting for a reply or their next turn, and the next follow-up is due on 01.07.25 (Kulak). 1 more venue would qualify but is missing info.')
    expect(r.action).toBe('missingInfo')
    expect(explainEmptyBatch({ rows: rows.slice(3), filters: {}, rules: rule(), today: TODAY })).toEqual({ reason: 'No venue needs contacting right now.', action: null })
  })
})
