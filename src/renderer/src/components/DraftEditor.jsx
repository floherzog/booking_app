import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import { DRAFT_EXTENSIONS, renderEmailHtml } from '@core/emailHtml'
import { api } from '../platform'
import { useT } from '../i18n'
import { useEscape } from '../lib/useEscape'
import { useInlinePrompt } from './InlinePrompt'
import { BoldIcon, ItalicIcon, UnderlineIcon, LinkIcon } from './icons'
import Busy from './Busy'

// A draft from the Drafts mailbox, edited in the app. Mail opens a draft from
// a link only to read it, so this is where it is changed: To, Cc, subject and
// text, with the editor the templates use. Save writes the edited draft back
// and removes the old one (main/ipc/mailDrafts.js); images and attachments
// stay as they were. Formatting the editor doesn't know (fonts, colours,
// tables) is simplified — drafts made by the app have none.
const addresses = list => (list || []).map(p => p.address).filter(Boolean).join(', ')

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={`px-2 py-1 rounded text-sm transition-colors disabled:opacity-40 ${active
        ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
      {children}
    </button>
  )
}

export default function DraftEditor({ draft, onSaved, onClose }) {
  const t = useT()
  const [promptNode, ask] = useInlinePrompt()
  const [loaded, setLoaded] = useState(null) // what the server had
  const [error, setError] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [saving, setSaving] = useState(false)
  const [, setVersion] = useState(0)
  useEscape(onClose, !saving)

  const editor = useEditor({
    extensions: DRAFT_EXTENSIONS,
    content: '',
    onUpdate: () => setVersion(v => v + 1),
    onSelectionUpdate: () => setVersion(v => v + 1),
    editorProps: {
      attributes: { class: 'booking-prose max-w-none min-h-[18rem] px-3 py-2 focus:outline-none text-sm text-gray-800 dark:text-gray-100' },
    },
  })

  const ref = { accountId: draft.accountId, mailbox: draft.mailbox, uid: draft.uid }
  useEffect(() => {
    let alive = true
    api.readDraft(ref).then(d => {
      if (!alive) return
      if (d?.error) { setError(d.error); return }
      setLoaded(d)
      setTo(addresses(d.to))
      setCc(addresses(d.cc))
      setSubject(d.subject || '')
    }).catch(e => alive && setError(e.message))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.accountId, draft.mailbox, draft.uid])
  useEffect(() => {
    if (editor && loaded) editor.commands.setContent(loaded.html || '<p></p>')
  }, [editor, loaded])

  async function addLink() {
    const previous = editor.getAttributes('link').href || ''
    const url = await ask({ label: previous ? t('Edit link') : t('Link URL'), initial: previous, placeholder: 'https://…', hint: t('Leave empty to remove the link.'), confirmLabel: previous ? t('Update') : t('Add link') })
    if (url === null) return
    const v = url.trim()
    if (!v) return editor.chain().focus().unsetLink().run()
    const href = /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(v) ? v : v.includes('@') && !v.includes('/') ? `mailto:${v}` : `https://${v}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
  const canLink = !!editor && (editor.isActive('link') || !editor.state.selection.empty)

  async function save() {
    if (!to.trim()) { setError(t('This draft has no recipient.')); return }
    setSaving(true)
    setError('')
    try {
      const { html } = renderEmailHtml(editor.getJSON())
      const r = await api.replaceDraft(ref, { to: to.trim(), cc: cc.trim(), subject, html })
      if (r?.error) throw new Error(r.error)
      onSaved?.(r)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const lbl = 'w-16 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400'
  // On the page itself, not inside the Email window: a frosted ancestor
  // would pin `fixed` to that window instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-[1340] bg-black/30 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }} role="dialog" aria-modal="true">
      {promptNode}
      <div className="bg-white/85 dark:bg-gray-800/85 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <h3 className="flex-1 text-base font-semibold text-gray-900 dark:text-gray-100">{t('Edit draft')}</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label={t('Close')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        {!loaded && !error ? (
          <p className="p-6 text-sm text-gray-400"><Busy label={t('Loading…')} /></p>
        ) : !loaded ? (
          <p className="p-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <>
            <div className="px-5 py-3 space-y-2 overflow-y-auto">
              <label className="flex items-center gap-2"><span className={lbl}>{t('To')}</span><input className={input} value={to} onChange={e => setTo(e.target.value)} /></label>
              <label className="flex items-center gap-2"><span className={lbl}>{t('Cc')}</span><input className={input} value={cc} onChange={e => setCc(e.target.value)} /></label>
              <label className="flex items-center gap-2"><span className={lbl}>{t('Subject')}</span><input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></label>
              <div className="rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800">
                <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <ToolbarButton title={t('Bold')} active={editor?.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon /></ToolbarButton>
                  <ToolbarButton title={t('Italic')} active={editor?.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon /></ToolbarButton>
                  <ToolbarButton title={t('Underline')} active={editor?.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon /></ToolbarButton>
                  <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                  <ToolbarButton title={canLink ? t('Link (⌘K)') : t('Select some text first, then add a link')} active={editor?.isActive('link')} disabled={!canLink} onClick={addLink}><LinkIcon /></ToolbarButton>
                </div>
                <div className="max-h-[50vh] overflow-y-auto"><EditorContent editor={editor} /></div>
              </div>
              {loaded.attachments?.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('Attachments, kept as they are:')} {loaded.attachments.map(a => a.filename).join(', ')}
                </p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <p className="flex-1 min-w-0 text-xs text-red-600 dark:text-red-400">{error}</p>
              <button type="button" onClick={onClose} disabled={saving} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-1.5">{t('Cancel')}</button>
              <button type="button" onClick={save} disabled={saving}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-md">
                {saving ? <Busy label={t('Saving…')} /> : t('Save draft')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
