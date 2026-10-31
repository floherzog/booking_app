import { useState, useRef, useMemo, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { EMAIL_EXTENSIONS, renderEmailHtml, EMAIL_BODY_STYLE, appAssetSrc } from '@core/emailHtml'
import { PLACEHOLDERS, substituteTemplate, languageForRow, contactOptionsFor } from '@core/templates'
import { uploadAsset, fetchVideoThumb } from '../lib/templates'
import { buildThumbFile } from '../lib/videoThumb'
import { useInlinePrompt } from './InlinePrompt'
import { genderOf, contactGenderOf, useGenders, useContactGenders } from '../lib/genders'
import { t, useT } from '../i18n'

const LANGUAGE_HINT = () => t('Two-letter code, e.g. de or en. It must match one of the codes in Settings → Languages.')

// Placeholders are inserted as literal {{text}} so they survive editing and are
// substituted later, on the JSON, before the HTML is generated.
function PlaceholderMenu({ onInsert, label }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        {label ?? t('Insert field')} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {PLACEHOLDERS.map(p => (
            <button
              key={p}
              type="button"
              onMouseDown={e => { e.preventDefault(); onInsert(`{{${p}}}`); setOpen(false) }}
              className="block w-full text-left px-3 py-1 text-xs font-mono text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {`{{${p}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm transition-colors disabled:opacity-40 ${active
        ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
      {children}
    </button>
  )
}

export default function TemplateEditor({ template, bandOptions, languages, settings, rows = [], onSave, onCancel }) {
  const t = useT()
  const [band, setBand] = useState(template.band || bandOptions[0] || '')
  const [language, setLanguage] = useState(template.language || languages.default || 'en')
  const [subject, setSubject] = useState(template.subject || '')
  const [previewIdx, setPreviewIdx] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  // Applied when a video is inserted, not when it is rendered — see videoLink.js.
  const video = settings?.templates?.video || {}
  // Bumped on every editor transaction so the preview memo recomputes as you type.
  const [docVersion, setDocVersion] = useState(0)
  const subjectRef = useRef(null)
  const fileRef = useRef(null)
  const [promptNode, ask] = useInlinePrompt()

  const editor = useEditor({
    extensions: EMAIL_EXTENSIONS,
    content: template.bodyJSON || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: () => setDocVersion(v => v + 1),
    editorProps: {
      attributes: {
        // `booking-prose` (index.css) mirrors the email's own spacing, so what
        // you type here is laid out the way the draft will be.
        class: 'booking-prose max-w-none min-h-[16rem] px-3 py-2 focus:outline-none text-sm text-gray-800 dark:text-gray-100',
      },
      handleKeyDown: (_view, event) => {
        // ⌘K is the usual "add link" shortcut and works with a selection made by
        // keyboard, which the toolbar button cannot capture.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          addLink()
          return true
        }
        return false
      },
    },
  })

  // Venues of this band make the most useful preview subjects.
  const previewCandidates = useMemo(
    () => rows.filter(r => r['Band'] === band && r['Venue']).slice(0, 200),
    [rows, band],
  )
  useEffect(() => {
    setPreviewIdx(prev => (previewCandidates.some(r => String(r._idx) === prev) ? prev : String(previewCandidates[0]?._idx ?? '')))
  }, [previewCandidates])

  const previewRow = previewCandidates.find(r => String(r._idx) === previewIdx) || null
  // The preview shows the greeting and articles a draft would get.
  const onDevice = (settings?.templates?.germanArticles ?? 'ondevice') !== 'off'
  const genderVersion = useGenders([previewRow?.['Venue']], onDevice && language === 'de')
  const nameVersion = useContactGenders([previewRow?.['Contact']], onDevice)

  // Live preview: substitute against a real venue, then render exactly the HTML
  // the email will carry.
  const preview = useMemo(() => {
    if (!editor || !previewRow) return null
    const opts = { ...contactOptionsFor(previewRow, settings), language, contactGender: contactGenderOf(previewRow['Contact']) }
    if (language === 'de' && onDevice) opts.gender = genderOf(previewRow['Venue'])
    const substituted = substituteTemplate({ subject, bodyJSON: editor.getJSON() }, previewRow, opts)
    // Same renderer the email uses, with one substitution: inline assets keep the
    // app's own URL instead of becoming cid: references, which a browser cannot
    // resolve. Without this every image in the preview — inline pictures and
    // video thumbnails alike — renders as a broken image.
    const { bodyHtml } = renderEmailHtml(substituted.bodyJSON, { assetSrc: appAssetSrc })
    return { ...substituted, bodyHtml }
    // editor.getJSON() is not reactive on its own — docVersion is what makes
    // this recompute as you type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, subject, previewRow, docVersion, settings, language, genderVersion, nameVersion])

  function insertIntoSubject(token) {
    const el = subjectRef.current
    if (!el) return setSubject(s => s + token)
    const start = el.selectionStart ?? subject.length
    const end = el.selectionEnd ?? subject.length
    const next = subject.slice(0, start) + token + subject.slice(end)
    setSubject(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { url } = await uploadAsset(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err) {
      setError(err.message)
    }
  }

  // Paste a YouTube URL; the thumbnail is downloaded in the main process and
  // stored as an ordinary inline asset, so it travels in the mail as a cid: image.
  async function insertVideo() {
    const url = await ask({
      label: t('YouTube video URL'),
      placeholder: 'https://www.youtube.com/watch?v=…',
      hint: t('The thumbnail is downloaded and embedded automatically. YouTube links only for now.'),
      confirmLabel: t('Insert'),
    })
    if (!url) return
    setError('')
    setBusy('video')
    try {
      const { data, mime, videoUrl, title } = await fetchVideoThumb(url)
      // The play badge is drawn into the image here, before it is stored, so
      // what the asset store holds is exactly what the email carries.
      const file = await buildThumbFile({ data, mime, playOverlay: video.playOverlay !== false })
      const { assetId } = await uploadAsset(file)
      editor.chain().focus().setVideoLink({
        url: videoUrl || url,
        thumbAssetId: assetId,
        label: title ? `▶ ${title}` : '▶ Watch video',
        showLabel: video.showLabel !== false,
      }).run()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // A bare "example.com" is what people actually type; without a scheme the mail
  // client resolves it against the message and the link goes nowhere.
  function normalizeUrl(url) {
    const value = url.trim()
    if (!value) return ''
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(value)) return value
    if (value.includes('@') && !value.includes('/')) return `mailto:${value}`
    return `https://${value}`
  }

  async function addLink() {
    const previous = editor.getAttributes('link').href || ''
    const url = await ask({
      label: previous ? t('Edit link') : t('Link URL'),
      initial: previous,
      placeholder: 'https://…',
      hint: t('Leave empty to remove the link.'),
      confirmLabel: previous ? t('Update') : t('Add link'),
    })
    if (url === null) return
    if (!url.trim()) return editor.chain().focus().unsetLink().run()
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizeUrl(url) }).run()
  }

  // A link mark needs text to sit on: with an empty selection outside an existing
  // link there is nothing to attach it to, so the button would silently do nothing.
  const canLink = !!editor && (editor.isActive('link') || !editor.state.selection.empty)

  async function handleSave() {
    if (!band.trim()) return setError(t('Choose a band for this template.'))
    if (!language.trim()) return setError(t('Give this template a language code.'))
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...template,
        band: band.trim(),
        language: language.trim().toLowerCase(),
        subject,
        bodyJSON: editor.getJSON(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="flex flex-col h-full min-h-0">
      {promptNode}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t("Band")}</label>
            <select className={input} value={band} onChange={e => setBand(e.target.value)}>
              <option value="">{t("Choose a band…")}</option>
              {bandOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>{t("Language")}</label>
            <input className={input} value={language} placeholder={t("de")} onChange={e => setLanguage(e.target.value)} />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{LANGUAGE_HINT()}</p>
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-2 mb-1">
            <label className={`${lbl} mb-0`}>{t("Subject")}</label>
            <PlaceholderMenu onInsert={insertIntoSubject} />
          </div>
          <input ref={subjectRef} className={input} value={subject} onChange={e => setSubject(e.target.value)} placeholder={t("Booking-Anfrage {{venue}}")} />
        </div>

        <div>
          <label className={lbl}>{t("Body")}</label>
          <div className="rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
            <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
              <ToolbarButton title={t("Bold")} active={editor?.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarButton>
              <ToolbarButton title={t("Italic")} active={editor?.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarButton>
              <ToolbarButton title={t("Underline")} active={editor?.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
              <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              <ToolbarButton
                title={canLink ? t('Link (⌘K)') : t('Select some text first, then add a link')}
                active={editor?.isActive('link')}
                disabled={!canLink}
                onClick={addLink}
              >🔗</ToolbarButton>
              <ToolbarButton title={t("Insert image")} onClick={() => fileRef.current?.click()}>🖼</ToolbarButton>
              <ToolbarButton
                title={t("Insert a YouTube video as a clickable thumbnail")}
                disabled={busy === 'video'}
                onClick={insertVideo}
              >{busy === 'video' ? '…' : '▶'}</ToolbarButton>
              <span className="flex-1" />
              <PlaceholderMenu onInsert={tx => editor.chain().focus().insertContent(tx).run()} />
            </div>
            <EditorContent editor={editor} />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
        </div>

        <div>
          <div className="flex items-end justify-between gap-2 mb-1">
            <label className={`${lbl} mb-0`}>{t("Preview")}</label>
            <select className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-xs focus:border-indigo-500 focus:ring-indigo-500"
              value={previewIdx} onChange={e => setPreviewIdx(e.target.value)}>
              {previewCandidates.length === 0 && <option value="">{t("No venues for this band")}</option>}
              {previewCandidates.map(r => (
                <option key={r._idx} value={r._idx}>{r['Venue']}{r['City'] ? ` · ${r['City']}` : ''}</option>
              ))}
            </select>
          </div>
          {preview ? (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t("To")} {previewRow['Email'] || '—'} {t("· language")}{' '}
                  <span className="font-mono">{languageForRow(previewRow, languages)}</span>
                </p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mt-0.5">{preview.subject || <span className="italic text-gray-400">{t("no subject")}</span>}</p>
              </div>
              {/* Rendered by the same function the email uses and wrapped in the
                  email body style, so the preview is what the draft will contain. */}
              <div
                className="px-3 py-2 bg-white"
                dangerouslySetInnerHTML={{ __html: `<div style="${EMAIL_BODY_STYLE}">${preview.bodyHtml}</div>` }}
              />
              {preview.empties.length > 0 && (
                <p className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
                  {t("Empty for this venue:")} {preview.empties.map(e => `{{${e}}}`).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t("Pick a band that has venues in your list to see a live preview.")}
            </p>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <p className="text-xs text-red-600 dark:text-red-400 min-h-[1rem]">{error}</p>
        <div className="flex gap-3 shrink-0">
          <button type="button" onClick={onCancel} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">{t("Cancel")}</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? t('Saving…') : t('Save template')}
          </button>
        </div>
      </div>
    </div>
  )
}
