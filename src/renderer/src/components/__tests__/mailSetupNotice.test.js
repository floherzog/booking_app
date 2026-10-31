// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import MailSetupNotice, { mailSetupGaps } from '../MailSetupNotice.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const account = { mail: { accounts: [{ id: 'a', host: 'imap.x.de', user: 'me@x.de' }] } }
const templates = [{ name: 'Booking', language: 'en' }]

describe('MailSetupNotice', () => {
  it('names what is missing', () => {
    expect(mailSetupGaps(account, templates)).toEqual([])
    expect(mailSetupGaps({}, templates)).toEqual(['account'])
    expect(mailSetupGaps(account, [])).toEqual(['templates'])
  })

  it('links each gap to its Settings section, and is empty when nothing is missing', async () => {
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    const onOpenSettings = vi.fn()
    await act(async () => root.render(createElement(MailSetupNotice, { settings: {}, templates: [], onOpenSettings, appleScript: true })))
    expect(el.textContent).toContain('No mail account set up yet')
    expect(el.textContent).toContain('works without one')
    const [mail, tpl] = el.querySelectorAll('button')
    await act(async () => mail.click())
    await act(async () => tpl.click())
    expect(onOpenSettings.mock.calls).toEqual([['mail'], ['templates']])
    await act(async () => root.render(createElement(MailSetupNotice, { settings: account, templates, onOpenSettings })))
    expect(el.textContent).toBe('')
  })
})
