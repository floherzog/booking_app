// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const api = vi.hoisted(() => ({
  readDraft: vi.fn(async () => ({
    from: { address: 'me@x' }, to: [{ address: 'info@moods.ch' }], cc: [], subject: 'Anfrage',
    html: '<p>Hallo Anna</p><p><img src="data:image/png;base64,ZmFrZQ=="></p>',
    attachments: [{ filename: 'rider.pdf', size: 9 }],
  })),
  replaceDraft: vi.fn(async () => ({ mailbox: 'Drafts', uid: 9 })),
}))
vi.mock('../../platform', () => ({ api, caps: { mail: true } }))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const { default: DraftEditor } = await import('../DraftEditor.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const wait = ms => act(() => new Promise(r => setTimeout(r, ms)))

describe('Edit draft', () => {
  it('loads the draft, and saves the edit back with its image', async () => {
    const onSaved = vi.fn()
    const el = document.createElement('div')
    document.body.replaceChildren(el)
    const root = createRoot(el)
    const draft = { accountId: 'default', mailbox: 'Drafts', uid: 4 }
    await act(async () => root.render(h(DraftEditor, { draft, onSaved, onClose: () => {} })))
    await wait(30)
    expect(api.readDraft).toHaveBeenCalledWith(draft)
    const inputs = [...document.body.querySelectorAll('input')]
    expect(inputs.map(i => i.value)).toEqual(['info@moods.ch', '', 'Anfrage'])
    expect(document.body.textContent).toContain('Hallo Anna')
    expect(document.body.textContent).toContain('rider.pdf')
    const save = [...document.body.querySelectorAll('button')].find(b => b.textContent === 'Save draft')
    await act(async () => save.click())
    await wait(10)
    const [ref, edit] = api.replaceDraft.mock.calls[0]
    expect(ref).toEqual(draft)
    expect(edit).toMatchObject({ to: 'info@moods.ch', cc: '', subject: 'Anfrage' })
    expect(edit.html).toContain('Hallo Anna')
    expect(edit.html).toContain('src="data:image/png;base64,ZmFrZQ=="')
    expect(onSaved).toHaveBeenCalled()
    act(() => root.unmount())
  })
})
