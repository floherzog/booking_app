import { describe, it, expect } from 'vitest'
import { listsOf, activateList, sameSource, listLabel, listUsable, newListId } from '../storageLists.js'

const file = { adapter: 'file', filePath: '/x/booking.csv', github: { repo: 'me/web', path: 'data/booking.csv' }, multiBand: { enabled: false } }

describe('venue lists', () => {
  it('turns a storage from before lists into one list, the shown one', () => {
    const { lists, active } = listsOf(file)
    expect(lists).toEqual([{ id: 'list-1', name: '', adapter: 'file', filePath: '/x/booking.csv', github: { repo: 'me/web', path: 'data/booking.csv' } }])
    expect(active).toBe('list-1')
    expect(listLabel(lists[0])).toBe('booking.csv')
  })

  it('switches: the chosen source on top, the one left keeps its place, web location untouched for a file list', () => {
    const s = { ...file, lists: [{ id: 'list-1', name: 'Mine' }, { id: 'list-2', name: 'Anna', adapter: 'file', filePath: '/y/anna.csv' }], active: 'list-1' }
    const next = activateList(s, 'list-2')
    expect(next.filePath).toBe('/y/anna.csv')
    expect(next.active).toBe('list-2')
    expect(next.github).toEqual(file.github) // what the web app shows stays
    expect(next.lists[0]).toMatchObject({ name: 'Mine', filePath: '/x/booking.csv' })
    expect(sameSource(s, next)).toBe(false)
    const back = activateList(next, 'list-1')
    expect(back.filePath).toBe('/x/booking.csv')
  })

  it('a GitHub list brings its repo along', () => {
    const s = { ...file, lists: [{ id: 'a', name: '' }, { id: 'b', name: 'Band', adapter: 'github', github: { repo: 'band/list', path: 'v.csv' } }], active: 'a' }
    const next = activateList(s, 'b')
    expect(next).toMatchObject({ adapter: 'github', github: { repo: 'band/list', path: 'v.csv' } })
    expect(listUsable(next.lists[1], { localFiles: false })).toBe(true)
    expect(listUsable(next.lists[0], { localFiles: false })).toBe(false)
  })

  it('renaming or adding a list is not a new source', () => {
    const s = { ...file, lists: [{ id: 'a', name: 'x' }], active: 'a' }
    expect(sameSource(s, { ...s, lists: [{ id: 'a', name: 'y' }, { id: 'b' }] })).toBe(true)
    expect(newListId([{ id: 'list-2' }])).toBe('list-3')
  })
})
