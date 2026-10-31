import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getPinItems, setPinItem, PIN_ITEMS } from '../uiPrefs'

describe('pin items', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    })
  })

  it('defaults to the toolbar, Save and the headings', () => {
    const items = getPinItems()
    expect(Object.keys(items)).toEqual(PIN_ITEMS.map(i => i.key))
    expect(items.chips).toBe(false)
    expect(items.dropdowns).toBe(false)
    expect(items.search && items.headings && items.save).toBe(true)
  })

  it('remembers a change and keeps the same object while nothing changes', () => {
    setPinItem('chips', true)
    const a = getPinItems()
    expect(a.chips).toBe(true)
    expect(getPinItems()).toBe(a)
    localStorage.setItem('booking_pinItems', '{broken')
    expect(getPinItems().chips).toBe(false)
  })
})
