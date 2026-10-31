import { describe, it, expect } from 'vitest'
import {
  deliveryForRow, isAutoSend, summarizeDelivery, selectRows, sourceRepeats,
  dueJobs, pendingJobs, parseLocalDateTime, defaultScheduleValue, nextOccurrence, repeatLabel,
} from '../delivery.js'
import { STATUS } from '../constants.js'

const auto = { Venue: 'A', Auto: 'TRUE' }
const manual = { Venue: 'B', Auto: '' }

describe('deliveryForRow', () => {
  it('drafts everything in draft mode, regardless of the Auto column', () => {
    expect(deliveryForRow(auto, 'draft')).toBe('draft')
    expect(deliveryForRow(manual, 'draft')).toBe('draft')
  })

  it('sends everything in send mode', () => {
    expect(deliveryForRow(auto, 'send')).toBe('send')
    expect(deliveryForRow(manual, 'send')).toBe('send')
  })

  it('lets the Auto column decide in auto mode', () => {
    expect(deliveryForRow(auto, 'auto')).toBe('send')
    expect(deliveryForRow(manual, 'auto')).toBe('draft')
  })

  it('defaults to drafting for an unknown mode', () => {
    expect(deliveryForRow(auto, undefined)).toBe('draft')
  })
})

describe('isAutoSend', () => {
  it('accepts the CSV spellings and nothing else', () => {
    expect(isAutoSend({ Auto: 'TRUE' })).toBe(true)
    expect(isAutoSend({ Auto: ' true ' })).toBe(true)
    expect(isAutoSend({ Auto: 'FALSE' })).toBe(false)
    expect(isAutoSend({})).toBe(false)
    expect(isAutoSend(null)).toBe(false)
  })
})

describe('summarizeDelivery', () => {
  it('counts what a run would do', () => {
    expect(summarizeDelivery([auto, manual, manual], 'auto')).toEqual({ send: 1, draft: 2 })
    expect(summarizeDelivery([auto, manual], 'send')).toEqual({ send: 2, draft: 0 })
    expect(summarizeDelivery([auto, manual], 'draft')).toEqual({ send: 0, draft: 2 })
  })
})

describe('scheduling', () => {
  const jobs = [
    { id: 'past', status: 'pending', runAt: '2026-01-01T10:00:00.000Z' },
    { id: 'future', status: 'pending', runAt: '2026-01-01T12:00:00.000Z' },
    { id: 'done', status: 'done', runAt: '2026-01-01T09:00:00.000Z' },
    { id: 'cancelled', status: 'cancelled', runAt: '2026-01-01T09:00:00.000Z' },
  ]
  const now = new Date('2026-01-01T11:00:00.000Z')

  it('treats a run whose time has passed as due, so a closed app catches up', () => {
    expect(dueJobs(jobs, now).map(j => j.id)).toEqual(['past'])
  })

  it('never re-runs a finished or cancelled job', () => {
    expect(dueJobs(jobs, new Date('2026-02-01T00:00:00.000Z')).map(j => j.id)).toEqual(['past', 'future'])
  })

  it('lists pending jobs soonest first', () => {
    expect(pendingJobs([jobs[1], jobs[0], jobs[2]]).map(j => j.id)).toEqual(['past', 'future'])
  })

  it('reads a datetime-local value as local wall-clock time', () => {
    const d = parseLocalDateTime('2026-03-04T17:30')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getHours()).toBe(17)
    expect(d.getMinutes()).toBe(30)
    expect(parseLocalDateTime('')).toBeNull()
    expect(parseLocalDateTime('not a date')).toBeNull()
  })

  it('defaults to a round time an hour out, never in the past', () => {
    const now2 = new Date(2026, 2, 4, 17, 32, 11)
    const value = defaultScheduleValue(now2)
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    const parsed = parseLocalDateTime(value)
    expect(parsed.getTime()).toBeGreaterThan(now2.getTime())
    expect(parsed.getMinutes() % 5).toBe(0)
  })
})

describe('selectRows', () => {
  const rows = [
    { Venue: 'a', _nextBatch: true },
    { Venue: 'b', Draft: 'TRUE' },
    { Venue: 'c', _status: STATUS.FOLLOW_UP_DUE },
    { Venue: 'd' },
  ]

  it('picks the batch plus anything flagged Draft', () => {
    expect(selectRows('nextBatch', { rows }).map(r => r.Venue)).toEqual(['a', 'b'])
  })

  it('picks follow-ups and Draft flags separately', () => {
    expect(selectRows('followUp', { rows }).map(r => r.Venue)).toEqual(['c'])
    expect(selectRows('draftFlag', { rows }).map(r => r.Venue)).toEqual(['b'])
  })

  it('hands back the current view untouched, and nothing for an unknown source', () => {
    expect(selectRows('filtered', { rows, filteredRows: [rows[3]] })).toEqual([rows[3]])
    const indexed = rows.map((r, i) => ({ ...r, _idx: i }))
    expect(selectRows('selected', { rows: indexed, selected: new Set([1]) })).toEqual([indexed[1]])
    expect(selectRows('selected', { rows })).toEqual([])
    expect(selectRows('nonsense', { rows })).toEqual([])
  })

  it('knows which sources a repeating run can reproduce', () => {
    expect(sourceRepeats('nextBatch')).toBe(true)
    expect(sourceRepeats('filtered')).toBe(false)
    expect(sourceRepeats('selected')).toBe(false)
  })
})

describe('nextOccurrence', () => {
  it('keeps the wall-clock time when stepping a day', () => {
    const at = new Date(2026, 2, 4, 8, 0, 0)   // 04.03.2026, 08:00 local
    const now = new Date(2026, 2, 4, 8, 30, 0)
    const next = new Date(nextOccurrence(at.toISOString(), 'daily', now))
    expect(next.getDate()).toBe(5)
    expect(next.getHours()).toBe(8)
    expect(next.getMinutes()).toBe(0)
  })

  it('keeps the weekday when stepping a week', () => {
    const at = new Date(2026, 2, 4, 8, 0, 0)
    const now = new Date(2026, 2, 4, 9, 0, 0)
    const next = new Date(nextOccurrence(at.toISOString(), 'weekly', now))
    expect(next.getDay()).toBe(at.getDay())
    expect(next.getDate()).toBe(11)
  })

  it('skips straight to the next future slot after a long gap, firing once', () => {
    const at = new Date(2026, 0, 1, 8, 0, 0)
    const now = new Date(2026, 3, 1, 12, 0, 0)
    const next = new Date(nextOccurrence(at.toISOString(), 'daily', now))
    expect(next.getTime()).toBeGreaterThan(now.getTime())
    expect(next.getDate()).toBe(2)
    expect(next.getMonth()).toBe(3)
  })

  it('has no next time for a one-off or an unparseable date', () => {
    expect(nextOccurrence(new Date().toISOString(), 'once')).toBeNull()
    expect(nextOccurrence('whenever', 'daily')).toBeNull()
    expect(repeatLabel('daily')).toBe('Every day')
    expect(repeatLabel(undefined)).toBe('Once')
  })
})
