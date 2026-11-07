import { describe, it, expect } from 'vitest'
import { carryOver } from '../carryOver.js'

const row = (i, venue, band = 'Juno', more = {}) => ({ _idx: i, Venue: venue, Band: band, City: 'Bern', Note: '', ...more })

describe('carryOver', () => {
  it('finds edited lines again after the file changed around them', () => {
    const before = [row(0, 'Moods'), row(1, 'Bird’s Eye'), row(2, 'Kaserne')]
    const fresh = [row(0, 'New Club'), row(1, 'Moods'), row(2, 'Kaserne'), row(3, 'Bird’s Eye')]
    const r = carryOver({ rows: before, edits: { 1: { Note: 'call Lukas' } }, deletions: new Set([2]) }, fresh)
    expect(r.edits).toEqual({ 3: { Note: 'call Lukas' } })
    expect([...r.deletions]).toEqual([2])
    expect(r.lost).toBe(0)
  })

  it('pairs same-named lines in order and drops what the file now agrees with', () => {
    const before = [row(0, 'Moods'), row(1, 'Moods')]
    const fresh = [row(0, 'X'), row(1, 'Moods', 'Juno', { Note: 'same' }), row(2, 'Moods')]
    const r = carryOver({ rows: before, edits: { 0: { Note: 'same' }, 1: { Note: 'second' } } }, fresh)
    expect(r.edits).toEqual({ 2: { Note: 'second' } })
  })

  it('brings back lines added in the app, with their edits', () => {
    const before = [row(0, 'Moods'), row(1, 'Moods', 'Trio')]
    const r = carryOver({ rows: before, edits: { 1: { Note: 'new' } }, additions: new Set([1]) }, [row(0, 'Moods')])
    expect(r.added).toEqual([{ Venue: 'Moods', Band: 'Trio', City: 'Bern', Note: 'new' }])
  })

  it('counts changes to lines no longer in the file', () => {
    const r = carryOver({ rows: [row(0, 'Gone')], edits: { 0: { Note: 'x' } } }, [row(0, 'Other')])
    expect(r.lost).toBe(1)
    expect(r.edits).toEqual({})
  })
})
