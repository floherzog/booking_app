// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { DEFAULT_RULES } from '@core/rules'

const api = vi.hoisted(() => ({
  hasSecret: vi.fn(async () => false),
  getAppVersion: vi.fn(async () => '0.0.0'),
  setSecret: vi.fn(async () => {}),
  checkForUpdates: vi.fn(async () => ({ newer: true, latest: '9.9.9', current: '0.15.0' })),
}))
const caps = vi.hoisted(() => ({}))
vi.mock('../../platform', () => ({ api, caps }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: SettingsPanel } = await import('../SettingsPanel.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))
const button = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent === text)

// React tracks an input's value itself; set it the way typing does.
function type(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function open(config, props = {}) {
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  const root = createRoot(el)
  const onSave = vi.fn(async part => part)
  const onBandsSettled = vi.fn(async () => {})
  const onClose = vi.fn()
  await act(async () => root.render(createElement(SettingsPanel, {
    config, onSave, onBandsSettled, onClose, onPersist: async () => {}, initialSection: 'bands', ...props,
  })))
  return { el, root, onSave, onBandsSettled, onClose }
}

const config = {
  rules: DEFAULT_RULES,
  bands: [{ name: 'Trillmann' }],
  storage: { adapter: 'file', filePath: '/x.csv' },
  draftLog: [{ venue: 'kept out of autosave' }],
}

describe('SettingsPanel autosave', () => {
  it('stores a change on its own, with only the panel’s keys, and asks about bands on leaving the page', async () => {
    const { el, root, onSave, onBandsSettled } = await open(config)
    await act(async () => type(el.querySelector('input[placeholder="Add a band…"]'), 'Almost Natural'))
    await act(async () => button(el, 'Add').click())
    await wait(700)
    expect(onSave).toHaveBeenCalledTimes(1)
    const part = onSave.mock.calls[0][0]
    expect(part.bands.map(b => b.name)).toEqual(['Almost Natural', 'Trillmann'])
    expect(part).not.toHaveProperty('draftLog')
    expect(onBandsSettled).not.toHaveBeenCalled()
    await act(async () => button(el, 'General').click())
    expect(onBandsSettled).toHaveBeenCalledTimes(1)
    expect(onBandsSettled.mock.calls[0][1].map(b => b.name)).toEqual(['Almost Natural', 'Trillmann'])
    await act(async () => root.unmount())
  })

  it('stores nothing while the rules are invalid, and Done closes', async () => {
    const { el, root, onSave, onClose } = await open({ ...config, rules: { ...DEFAULT_RULES, batchSize: -1 } })
    await act(async () => type(el.querySelector('input[placeholder="Add a band…"]'), 'Almost Natural'))
    await act(async () => button(el, 'Add').click())
    await wait(700)
    expect(onSave).not.toHaveBeenCalled()
    await act(async () => button(el, 'Done').click())
    expect(onClose).toHaveBeenCalled()
    await act(async () => root.unmount())
  })

  it('offers bands the CSV uses, and names the ones no venue uses', async () => {
    const rows = [{ Band: 'Trillmann' }, { Band: 'Foo' }, { Band: 'foo ' }]
    const { el, root, onSave } = await open({ ...config, bands: [{ name: 'Trillmann' }, { name: 'Old' }] }, { rows })
    expect(el.textContent).toContain('Found in the CSV:')
    expect(el.textContent).toContain('Not used by any venue: Old')
    await act(async () => button(el, '+ Foo').click())
    await wait(700)
    expect(onSave.mock.calls.at(-1)[0].bands.map(b => b.name)).toEqual(['Foo', 'Old', 'Trillmann'])
    expect(button(el, '+ Foo')).toBeUndefined()
    await act(async () => root.unmount())
  })

  it('keeps the pinned-bar choices behind Customize', async () => {
    const { el, root } = await open(config, { initialSection: 'general' })
    expect(el.textContent).not.toContain('Column headings')
    await act(async () => button(el, 'Customize…').click())
    expect(el.textContent).toContain('Column headings')
    await act(async () => button(el, 'Hide choices').click())
    expect(el.textContent).not.toContain('Column headings')
    await act(async () => root.unmount())
  })

  it('hands a newer version from Check for updates to the banner', async () => {
    caps.updates = true
    const onUpdateFound = vi.fn()
    const { el, root } = await open(config, { initialSection: 'general', onUpdateFound })
    await act(async () => button(el, 'Check for updates').click())
    expect(onUpdateFound).toHaveBeenCalledWith(expect.objectContaining({ latest: '9.9.9' }))
    expect(el.textContent).toContain('Booking 9.9.9 is available — download it from the banner at the top.')
    delete caps.updates
    await act(async () => root.unmount())
  })
})
