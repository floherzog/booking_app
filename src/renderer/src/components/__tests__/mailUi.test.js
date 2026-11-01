// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const api = vi.hoisted(() => ({
  readMail: vi.fn(async () => ({ subject: 'Re: Anfrage', from: { name: 'Anna', address: 'info@venue.de' }, to: [], cc: [], html: '<p>Hallo</p><script>parent.hacked = 1</script><img src="https://track.example/x.png">', messageId: '<a@x>' })),
  listMailHistory: vi.fn(async () => ({ messages: [] })),
  openExternal: vi.fn(),
}))
vi.mock('../../platform', () => ({ api, caps: {} }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const { default: BannerSlot } = await import('../BannerSlot.jsx')
const { default: MailReader, emailDocument } = await import('../MailReader.jsx')
const { findReply } = await import('../../lib/mailHistory.js')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))

function mount(node) {
  const el = document.createElement('div')
  document.body.replaceChildren(el)
  const root = createRoot(el)
  act(() => root.render(node))
  return { el, root }
}

describe('BannerSlot', () => {
  it('slides in, keeps its content while sliding out, then goes', async () => {
    const { el, root } = mount(h(BannerSlot, { show: true }, h('p', null, 'hello')))
    await wait(50)
    expect(el.querySelector('[data-banner-slot]').dataset.bannerSlot).toBe('open')
    act(() => root.render(h(BannerSlot, { show: false }, null)))
    expect(el.querySelector('[data-banner-slot]').dataset.bannerSlot).toBe('closed')
    expect(el.textContent).toBe('hello')
    await wait(250)
    expect(el.innerHTML).toBe('')
    act(() => root.unmount())
  })
  it('renders nothing while hidden', () => {
    const { el, root } = mount(h(BannerSlot, { show: false }, h('p', null, 'x')))
    expect(el.innerHTML).toBe('')
    act(() => root.unmount())
  })
})

describe('MailReader', () => {
  it('shows HTML in a sandbox that runs no scripts and loads nothing remote', async () => {
    const onClose = vi.fn()
    const { el, root } = mount(h(MailReader, { message: { accountId: 'a', mailbox: 'INBOX', uid: 7, subject: 'Re: Anfrage' }, onClose }))
    await wait(10)
    expect(api.readMail).toHaveBeenCalledWith({ accountId: 'a', mailbox: 'INBOX', uid: 7 })
    const frame = el.querySelector('iframe')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'; img-src data:")
    expect(el.textContent).toContain('Anna <info@venue.de>')
    ;[...el.querySelectorAll('button')].find(b => b.textContent === 'Open in Mail').click()
    expect(api.openExternal).toHaveBeenCalledWith('message://%3Ca%40x%3E')
    act(() => root.unmount())
  })
  it('puts the policy before the message', () => {
    const doc = emailDocument('<p>x</p>')
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<p>x</p>'))
  })
})

describe('findReply', () => {
  const msgs = [
    { direction: 'out', date: '2026-10-02T09:00:00Z' },
    { direction: 'in', date: '2026-10-02T12:00:00Z', subject: 'Re' },
    { direction: 'in', date: '2026-09-01T12:00:00Z' },
  ]
  it('finds the incoming message from the Last reply day', () => {
    expect(findReply(msgs, '02.10.26')?.subject).toBe('Re')
    expect(findReply(msgs, '03.10.26')).toBe(null)
    expect(findReply(msgs, '')).toBe(null)
  })
})

describe('MailHistory', () => {
  it('writes dates as DD.MM.YY and says which way each mail went', async () => {
    const { MailContext } = await import('../../lib/mailHistory.js')
    const { default: MailHistory } = await import('../MailHistory.jsx')
    api.listMailHistory.mockResolvedValueOnce({ messages: [
      { accountId: 'a', mailbox: 'Sent', uid: 1, direction: 'out', date: '2026-11-01T10:00:00Z', subject: 'Releasetour' },
      { accountId: 'a', mailbox: 'INBOX', uid: 2, direction: 'in', date: '2026-10-02T10:00:00Z', subject: 'Re: Releasetour' },
    ] })
    const ctx = { ready: true, openMessage: vi.fn(), openReply: async () => false }
    const { el, root } = mount(h(MailContext.Provider, { value: ctx }, h(MailHistory, { email: 'dates@venue.de' })))
    await wait(10)
    ;[...el.querySelectorAll('button')].find(b => b.textContent.includes('Emails (2)')).click()
    await wait(10)
    const rows = [...el.querySelectorAll('li')].map(li => li.textContent)
    expect(rows[0]).toContain('↗ Sent')
    expect(rows[0]).toContain('01.11.26')
    expect(rows[1]).toContain('↙ Received')
    expect(rows[1]).toContain('02.10.26')
    act(() => root.unmount())
  })
})

describe('MailHistory while loading', () => {
  it('says it is fetching, then goes away when there is nothing', async () => {
    const { MailContext } = await import('../../lib/mailHistory.js')
    const { default: MailHistory } = await import('../MailHistory.jsx')
    let finish
    api.listMailHistory.mockReturnValueOnce(new Promise(r => { finish = r }))
    const ctx = { ready: true, openMessage: vi.fn(), openReply: async () => false }
    const { el, root } = mount(h(MailContext.Provider, { value: ctx }, h(MailHistory, { email: 'slow@venue.de' })))
    await wait(10)
    expect(el.textContent).toBe('Fetching emails…')
    expect(el.querySelector('svg.animate-spin')).toBeTruthy()
    await act(async () => finish({ messages: [] }))
    expect(el.innerHTML).toBe('')
    act(() => root.unmount())
  })
})
