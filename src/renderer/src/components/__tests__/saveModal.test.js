// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

vi.mock('../../platform', () => ({ api: {}, caps: {} }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: SaveModal } = await import('../SaveModal.jsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('SaveModal', () => {
  it('groups the changes by venue, the name once per group', () => {
    const rows = [
      { _idx: 1, Venue: 'Ars Musica', 'Last emailed': '01.10.26', Status: '', Note: '' },
      { _idx: 2, Venue: 'Moods', 'Last emailed': '', Note: '' },
    ]
    const edits = { 1: { 'Last emailed': '01.11.26', Note: 'called' }, 2: { Note: 'x' } }
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    act(() => root.render(h(SaveModal, { rows, edits, adapter: { label: 'test.csv', save: vi.fn() }, onSuccess: vi.fn(), onClose: vi.fn() })))
    const groups = [...el.querySelectorAll('[data-venue-group]')]
    expect(groups).toHaveLength(2)
    expect(groups[0].querySelector('th').textContent).toBe('Ars Musica2 changes')
    expect(groups[0].querySelectorAll('tr')).toHaveLength(3) // heading + 2 fields
    expect(el.textContent.match(/Ars Musica/g)).toHaveLength(1)
    expect(el.textContent).toContain('Save 3 changes')
    act(() => root.unmount())
  })
})
