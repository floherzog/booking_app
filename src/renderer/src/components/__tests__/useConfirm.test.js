// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useConfirm } from '../InlinePrompt.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let confirm
function Host() {
  const [node, c] = useConfirm()
  confirm = c
  return createElement(Fragment, null, node)
}
async function mount() {
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  await act(async () => createRoot(el).render(createElement(Host)))
}
const buttons = () => [...document.querySelectorAll('[role="dialog"] button')]
const opts = {
  title: 'Set Dates on its venues?', message: 'Two venues have other dates.', cancelLabel: 'Not now',
  choices: [{ value: 'empty', label: 'Only the 1 without Dates' }, { value: 'all', label: 'Set on 3 venues' }],
}

describe('useConfirm', () => {
  it('shows the question with its buttons, the last one focused, and resolves the one clicked', async () => {
    await mount()
    let answer
    await act(async () => { confirm(opts).then(v => { answer = v }) })
    expect(document.body.textContent).toContain('Set Dates on its venues?')
    expect(buttons().map(b => b.textContent)).toEqual(['Not now', 'Only the 1 without Dates', 'Set on 3 venues'])
    expect(document.activeElement.textContent).toBe('Set on 3 venues')
    await act(async () => buttons()[1].click())
    expect(answer).toBe('empty')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('resolves null on Not now and on Escape', async () => {
    await mount()
    let answer = 'x'
    await act(async () => { confirm(opts).then(v => { answer = v }) })
    await act(async () => buttons()[0].click())
    expect(answer).toBeNull()

    answer = 'x'
    await act(async () => { confirm(opts).then(v => { answer = v }) })
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(answer).toBeNull()
  })
})
