import { describe, it, expect } from 'vitest'
import { withEmailCounters, stagedCounters } from '../emailCounters.js'
import { replyHealth } from '../replyStatus.js'

const row = { 'Last emailed': '01.09.26', 'Total emails': '2', 'Recent emails': '1', Status: 'reply: 15.08.26' }

describe('email counters follow the dates', () => {
  it('a later Last emailed stages one more email, total and since the reply', () => {
    expect(withEmailCounters(row, { 'Last emailed': '02.11.26' })).toEqual({
      'Last emailed': '02.11.26', 'Total emails': '3', 'Recent emails': '2',
    })
  })

  it('takes the counters back when the date goes back', () => {
    const staged = withEmailCounters(row, { 'Last emailed': '02.11.26' })
    expect(withEmailCounters(row, {}, staged)).toEqual({})
    expect(withEmailCounters(row, { 'Last emailed': '01.08.26' }, staged)).toEqual({ 'Last emailed': '01.08.26' })
  })

  it('a first date on a venue never written to counts as its first email', () => {
    expect(withEmailCounters({ 'Last emailed': '', 'Total emails': '' }, { 'Last emailed': '02.11.26' }))
      .toEqual({ 'Last emailed': '02.11.26', 'Total emails': '1', 'Recent emails': '1' })
  })

  it('a new real reply starts Recent emails again; a send after it is one', () => {
    expect(stagedCounters(row, { Status: 'reply: 20.10.26' })).toEqual({ 'Total emails': '2', 'Recent emails': '0' })
    expect(stagedCounters(row, { Status: 'reply: 20.10.26', 'Last emailed': '25.10.26' })).toEqual({ 'Total emails': '3', 'Recent emails': '1' })
    expect(stagedCounters(row, { Status: 'auto-reply: 20.10.26' })).toBe(null)
  })

  it('leaves counters edited by hand alone', () => {
    const handEdited = { 'Last emailed': '02.11.26', 'Total emails': '9', 'Recent emails': '2' }
    expect(withEmailCounters(row, { ...handEdited, 'Last emailed': '03.11.26' }, handEdited)['Total emails']).toBe('9')
  })

  it('a venue with a Last emailed date counts as contacted even with no count', () => {
    expect(replyHealth({ 'Last emailed': '01.09.26', 'Total emails': '' })).toBe('silent')
    expect(replyHealth({ 'Last emailed': '', 'Total emails': '' })).toBe('none')
  })
})
