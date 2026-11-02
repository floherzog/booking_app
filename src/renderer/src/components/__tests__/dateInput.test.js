// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: DateInput } = await import('../DateInput.jsx')
const { setDateOrder } = await import('@core/parseDate')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => setDateOrder('dmy'))

function mount(props) {
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  const root = createRoot(el)
  act(() => root.render(h(DateInput, props)))
  return { el, root }
}
// What a real click does: mousedown (which the calendar cancels), then click.
function press(node) {
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  node.dispatchEvent(down)
  node.click()
  return down.defaultPrevented
}
const calendar = () => document.querySelector('[data-calendar]')
const calButton = (label) => [...calendar().querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)

describe('DateInput calendar', () => {
  it('opens under the field, moves between months without leaving the field, and picks a day', () => {
    const onCommit = vi.fn()
    const { el, root } = mount({ value: '01.11.26', onCommit })
    const input = el.querySelector('input')
    act(() => { input.focus(); press(el.querySelector('button[aria-label="Pick a day"]')) })
    expect(calendar()).toBeTruthy()
    expect(calendar().textContent).toContain('November 2026')
    let kept
    act(() => { kept = press(calButton('Next month')) })
    expect(kept).toBe(true) // focus stays in the field: nothing commits, nothing closes
    expect(onCommit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    expect(calendar().textContent).toContain('December 2026')
    // Always six weeks, so the calendar keeps its size from month to month.
    const cells = () => calendar().querySelector('.grid.gap-0\\.5').children.length
    expect(cells()).toBe(42)
    act(() => { press(calButton('Previous month')); press(calButton('Previous month')); press(calButton('Previous month')) })
    expect(calendar().textContent).toContain('September 2026')
    expect(cells()).toBe(42)
    act(() => { press(calButton('Next month')); press(calButton('Next month')); press(calButton('Next month')) })
    act(() => { press(calButton('24')) })
    expect(onCommit).toHaveBeenCalledWith('24.12.26')
    expect(calendar()).toBe(null)
    expect(input.value).toBe('24.12.26')
    act(() => root.unmount())
  })

  it('Escape closes the calendar before anything else', () => {
    const onCancel = vi.fn()
    const { el, root } = mount({ value: '', onCommit: vi.fn(), onCancel })
    const input = el.querySelector('input')
    act(() => { input.focus(); press(el.querySelector('button[aria-label="Pick a day"]')) })
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(calendar()).toBe(null)
    expect(onCancel).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('starts the week on Sunday with the US date format, and shows the field that way', () => {
    setDateOrder('mdy')
    const { el, root } = mount({ value: '01.11.26', onCommit: vi.fn() })
    expect(el.querySelector('input').value).toBe('11/01/26')
    act(() => { el.querySelector('input').focus(); press(el.querySelector('button[aria-label="Pick a day"]')) })
    expect(calendar().querySelector('.grid-cols-7').textContent.startsWith('Su')).toBe(true)
    act(() => root.unmount())
  })
})
