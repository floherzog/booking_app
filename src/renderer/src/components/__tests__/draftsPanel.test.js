// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const drafts = [
  { accountId: 'default', mailbox: 'Drafts', uid: 1, to: [{ address: 'info@moods.ch' }], cc: [], subject: 'Anfrage Moods', date: '2026-11-01T10:00:00Z', messageId: '<m@x>' },
  { accountId: 'default', mailbox: 'Drafts', uid: 2, to: [{ address: 'stranger@example.com' }], cc: [], subject: 'Privat', date: '2026-11-01T11:00:00Z', messageId: '<p@x>' },
]
const api = vi.hoisted(() => ({
  listDrafts: vi.fn(),
  sendDrafts: vi.fn(async refs => refs.map(r => ({ ...r, accepted: ['info@moods.ch'], filed: true, removed: true }))),
  deleteDrafts: vi.fn(async refs => refs.map(r => ({ ...r, ok: true }))),
  openExternal: vi.fn(),
}))
vi.mock('../../platform', () => ({ api, caps: { mail: true } }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: DraftsPanel } = await import('../DraftsPanel.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))
const button = (el, label) => [...el.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)
const rows = [{ _idx: 3, Venue: 'Moods', City: 'Zürich', Email: 'info@moods.ch', Band: 'Almost Natural' }]

async function open(props = {}) {
  api.listDrafts.mockResolvedValue({ drafts, failures: [] })
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  const root = createRoot(el)
  const onSent = vi.fn()
  await act(async () => root.render(h(DraftsPanel, { rows, settings: {}, mailReady: true, onSent, ...props })))
  await wait(10)
  return { el, root, onSent }
}

describe('Current drafts', () => {
  it('shows only drafts to venues in the CSV, with the venue', async () => {
    const { el, root } = await open()
    expect(el.textContent).toContain('Moods · Zürich')
    expect(el.textContent).toContain('Anfrage Moods')
    expect(el.textContent).not.toContain('Privat')
    act(() => root.unmount())
  })

  it('sends only on the second click, then records the send and drops the draft', async () => {
    const { el, root, onSent } = await open()
    await act(async () => button(el, 'Send this draft now').click())
    expect(api.sendDrafts).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Send?')
    api.listDrafts.mockResolvedValue({ drafts: drafts.slice(1), failures: [] }) // gone from Drafts
    await act(async () => button(el, 'Send this draft now').click())
    await wait(10)
    expect(el.textContent).not.toContain('Anfrage Moods')
    expect(api.sendDrafts).toHaveBeenCalledWith([{ accountId: 'default', mailbox: 'Drafts', uid: 1 }])
    expect(onSent).toHaveBeenCalledWith(rows[0])
    expect(el.textContent).toContain('1 sent')
    act(() => root.unmount())
  })

  it('deletes ticked drafts after asking', async () => {
    api.deleteDrafts.mockClear()
    const { el, root, onSent } = await open()
    await act(async () => el.querySelector('input[aria-label="Select this draft"]').click())
    await act(async () => button(el, 'Delete 1').click())
    expect(api.deleteDrafts).not.toHaveBeenCalled()
    await act(async () => button(el, 'Really delete 1?').click())
    await wait(10)
    expect(api.deleteDrafts).toHaveBeenCalledWith([{ accountId: 'default', mailbox: 'Drafts', uid: 1 }])
    expect(onSent).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('opens the venue from its name', async () => {
    const onOpenVenue = vi.fn()
    const { el, root } = await open({ onOpenVenue })
    await act(async () => button(el, 'Moods').click())
    expect(onOpenVenue).toHaveBeenCalledWith(3)
    act(() => root.unmount())
  })

  it('points to the mail settings without an account', async () => {
    const onOpenSettings = vi.fn()
    const { el, root } = await open({ mailReady: false, onOpenSettings })
    expect(el.textContent).toContain('Drafts show here once a mail account is set up.')
    await act(async () => button(el, 'Mail settings').click())
    expect(onOpenSettings).toHaveBeenCalledWith('mail')
    act(() => root.unmount())
  })
})
