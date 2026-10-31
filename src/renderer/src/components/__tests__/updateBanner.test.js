// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

// The banner talks to the main process only through `api`.
const api = vi.hoisted(() => ({
  openExternal: vi.fn(),
  downloadUpdate: vi.fn(),
  cancelUpdateDownload: vi.fn(),
  openUpdate: vi.fn(),
  revealUpdate: vi.fn(),
  onUpdateProgress: vi.fn(cb => { api.progress = cb; return () => {} }),
}))
vi.mock('../../platform', () => ({ api, caps: {} }))
const { default: UpdateBanner } = await import('../UpdateBanner.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const update = {
  newer: true, latest: '0.11.0', current: '0.10.0', url: 'https://github.com/x/releases/tag/v0.11.0',
  downloadUrl: 'https://github.com/x/Booking-0.11.0-arm64.dmg',
  download: { url: 'https://github.com/x/Booking-0.11.0-arm64.dmg', name: 'Booking-0.11.0-arm64.dmg', size: 1000, digest: '' },
}
let el
async function show(props = {}) {
  el = document.createElement('div')
  document.body.replaceChildren(el)
  await act(async () => createRoot(el).render(createElement(UpdateBanner, { update, onDismiss: () => {}, ...props })))
}
const button = text => [...el.querySelectorAll('button')].find(b => b.textContent === text)
const click = async text => act(async () => button(text).click())

describe('UpdateBanner', () => {
  beforeEach(() => vi.clearAllMocks())

  it('downloads inside the app with a progress bar, then offers Open and Show in Finder', async () => {
    let finish
    api.downloadUpdate.mockReturnValue(new Promise(r => { finish = r }))
    await show()
    expect(el.textContent).toContain('Booking 0.11.0 is available')
    await click('Download')
    expect(api.openExternal).not.toHaveBeenCalled()
    await act(async () => api.progress({ received: 420, total: 1000 }))
    expect(el.textContent).toContain('42 %')
    expect(button('Cancel')).toBeTruthy()
    await act(async () => finish({ path: '/Users/me/Downloads/Booking-0.11.0-arm64.dmg', name: 'Booking-0.11.0-arm64.dmg', quarantineCleared: true }))
    expect(el.textContent).toContain('is in Downloads')
    expect(el.textContent).not.toContain('xattr')
    await click('Open')
    expect(api.openUpdate).toHaveBeenCalled()
    await click('Show in Finder')
    expect(api.revealUpdate).toHaveBeenCalled()
  })

  it('says how to clear the quarantine mark if it could not be cleared', async () => {
    api.downloadUpdate.mockResolvedValue({ path: '/d/B (2).dmg', name: 'B (2).dmg', quarantineCleared: false })
    await show()
    await click('Download')
    expect(el.textContent).toContain('xattr -dr com.apple.quarantine ~/Downloads/"B (2).dmg"')
  })

  it('falls back to the browser when the download fails, and goes back after Cancel', async () => {
    api.downloadUpdate.mockResolvedValue({ error: 'GitHub returned 500.' })
    await show()
    await click('Download')
    expect(el.textContent).toContain('Download failed: GitHub returned 500.')
    await click('Download in browser')
    expect(api.openExternal).toHaveBeenCalledWith(update.downloadUrl)

    api.downloadUpdate.mockResolvedValue({ cancelled: true })
    await click('Try again')
    expect(button('Download')).toBeTruthy()
  })

  it('uses the browser straight away for a release without a file for this Mac', async () => {
    await show({ update: { ...update, download: null } })
    await click('Download')
    expect(api.downloadUpdate).not.toHaveBeenCalled()
    expect(api.openExternal).toHaveBeenCalledWith(update.downloadUrl)
  })
})
