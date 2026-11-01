// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

vi.mock('../../platform', () => ({ api: {}, caps: {} }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: TemplateEditor } = await import('../TemplateEditor.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const template = { id: 't1', band: 'Ghost Band', language: 'en', subject: 'Hi', bodyJSON: { type: 'doc', content: [] } }

describe('TemplateEditor', () => {
  it('keeps a template whose band no longer exists selectable, and saves a new band', async () => {
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    const onSave = vi.fn(async () => {})
    await act(async () => root.render(createElement(TemplateEditor, {
      template, bandOptions: ['Almost Natural', 'Trillmann'], languages: { default: 'en', map: {} }, settings: {}, rows: [], onSave, onCancel: () => {},
    })))
    const select = el.querySelector('select')
    expect(select.value).toBe('Ghost Band')
    expect(select.selectedOptions[0].textContent).toBe('Ghost Band (no longer a band)')
    await act(async () => {
      select.value = 'Trillmann'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const save = [...el.querySelectorAll('button')].find(b => b.textContent === 'Save template')
    await act(async () => save.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', band: 'Trillmann' }))
    await act(async () => root.unmount())
  })
})
