// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import PolicyDriftNotice from '../PolicyDriftNotice.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const button = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent === text)

async function render(drift) {
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  const root = createRoot(el)
  const rules = { holdKeywords: ['call', 'abgesagt'], holdOverrideDays: 180, batchSize: 10 }
  const onSaveRules = vi.fn(async () => {})
  const onOpenLogic = vi.fn()
  await act(async () => root.render(createElement(PolicyDriftNotice, { drift, rules, scriptPath: 'scripts/create_booking_batch.py', onSaveRules, onOpenLogic })))
  return { el, root, onSaveRules, onOpenLogic }
}

describe('PolicyDriftNotice', () => {
  it('says what each difference does and fixes it on the app’s side', async () => {
    const { el, root, onSaveRules, onOpenLogic } = await render({ appOnly: ['abgesagt'], scriptOnly: ['wait'], days: { script: 365, app: 180 } })
    expect(el.textContent).toContain('a note with "abgesagt" holds a venue back in the app, but OpenClaw doesn’t know the word')
    expect(el.textContent).toContain('hard_stop or wait_markers in create_booking_batch.py')
    expect(el.textContent).toContain('A hold ends after 365 days in OpenClaw, but after 180 days here.')

    await act(async () => button(el, 'Remove from the Rules').click())
    expect(onSaveRules).toHaveBeenLastCalledWith(expect.objectContaining({ holdKeywords: ['call'], batchSize: 10 }))
    await act(async () => button(el, 'Add to the Rules').click())
    expect(onSaveRules).toHaveBeenLastCalledWith(expect.objectContaining({ holdKeywords: ['call', 'abgesagt', 'wait'] }))
    await act(async () => button(el, 'Use 365 days here too').click())
    expect(onSaveRules).toHaveBeenLastCalledWith(expect.objectContaining({ holdOverrideDays: 365 }))
    await act(async () => button(el, 'Logic').click())
    expect(onOpenLogic).toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it('shows only the differences there are', async () => {
    const { el, root } = await render({ appOnly: [], scriptOnly: ['wait', 'later'], days: null })
    expect(el.textContent).toContain('notes with "wait", "later" hold a venue back there')
    expect(button(el, 'Remove from the Rules')).toBeUndefined()
    expect(el.textContent).not.toContain('A hold ends')
    await act(async () => root.unmount())
  })
})
