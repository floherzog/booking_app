// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement as h, act } from 'react'
import { createRoot } from 'react-dom/client'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: BulkEditBar } = await import('../BulkEditBar.jsx')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function change(el, value) {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
  set.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('Batch edit', () => {
  it('sets the reply status of every selected venue', async () => {
    const onBulkEdit = vi.fn()
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    await act(async () => root.render(h(BulkEditBar, { selectedCount: 3, filteredCount: 9, onBulkEdit, onSelectAllFiltered() {}, onClear() {}, onBulkDelete() {}, onDone() {} })))
    const [field] = el.querySelectorAll('select')
    expect([...field.options].map(o => o.value)).toEqual(expect.arrayContaining(['Status', 'Last played', 'Contact', 'Website']))
    await act(async () => change(field, 'Status'))
    const kind = el.querySelectorAll('select')[1]
    await act(async () => change(kind, 'auto-reply'))
    const apply = [...el.querySelectorAll('button')].find(b => b.textContent === 'Apply')
    await act(async () => apply.click())
    expect(onBulkEdit).toHaveBeenLastCalledWith('Status', 'auto-reply')
    await act(async () => change(kind, 'none'))
    await act(async () => apply.click())
    expect(onBulkEdit).toHaveBeenLastCalledWith('Status', '')
    act(() => root.unmount())
  })

  it('sets the email counters as whole numbers', async () => {
    const onBulkEdit = vi.fn()
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    await act(async () => root.render(h(BulkEditBar, { selectedCount: 2, filteredCount: 9, onBulkEdit, onSelectAllFiltered() {}, onClear() {}, onBulkDelete() {}, onDone() {} })))
    const [field] = el.querySelectorAll('select')
    await act(async () => change(field, 'Recent emails'))
    const input = el.querySelector('input[type="number"]')
    await act(async () => change(input, '3'))
    const apply = [...el.querySelectorAll('button')].find(b => b.textContent === 'Apply')
    await act(async () => apply.click())
    expect(onBulkEdit).toHaveBeenLastCalledWith('Recent emails', '3')
    await act(async () => change(field, 'Total emails'))
    await act(async () => change(el.querySelector('input[type="number"]'), '0'))
    await act(async () => apply.click())
    expect(onBulkEdit).toHaveBeenLastCalledWith('Total emails', '0')
    act(() => root.unmount())
  })
})
