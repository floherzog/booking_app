import { useEffect, useState } from 'react'
import { api } from '../platform'
import { readMail, cachedMail } from '../lib/mailBodies'
import { useT } from '../i18n'
import { useEscape } from '../lib/useEscape'
import { formatDay } from '@core/parseDate'
import { useDateOrder } from '../lib/dateOrder'
import Busy from './Busy'

// The email page an HTML message is shown in. Nothing it references is loaded:
// no scripts (the iframe is sandboxed without allow-scripts), no remote images
// or fonts (the CSP allows only inline styles and data: images), so opening a
// message tells its sender nothing. Links open in the browser.
export function emailDocument(html) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<base target="_blank">
<style>body{margin:0;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .5em;padding-left:.75em;border-left:2px solid #ddd;color:#555}</style>
</head><body>${html}</body></html>`
}

const who = p => (p?.name ? `${p.name} <${p.address}>` : p?.address || '')

// One message, read-only. `message` is a list entry ({ accountId, mailbox, uid,
// subject, … }); the body is fetched when it opens.
export default function MailReader({ message, onClose }) {
  const t = useT()
  // A body read ahead (lib/mailBodies.js) shows at once.
  const [mail, setMail] = useState(() => cachedMail(message))
  const [error, setError] = useState('')
  useEscape(onClose)

  useEffect(() => {
    let alive = true
    readMail(message)
      .then(r => { if (!alive) return; if (r?.error) setError(r.error); else setMail(r) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [message])

  const head = mail || message
  useDateOrder()
  const when = head.date ? new Date(head.date) : null
  const date = when ? `${formatDay(when)}, ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
  const row = (label, value) => value ? (
    <div className="flex gap-2"><span className="w-12 shrink-0 text-gray-400 dark:text-gray-500">{label}</span><span className="min-w-0 break-words">{value}</span></div>
  ) : null

  return (
    <div className="fixed inset-0 z-[1350] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true">
      <div className="bg-white/85 dark:bg-gray-800/85 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 min-w-0 text-base font-semibold text-gray-900 dark:text-gray-100 break-words">{head.subject || t('(no subject)')}</h3>
            {head.messageId && (
              <button type="button" onClick={() => api.openExternal(`message://${encodeURIComponent(head.messageId)}`)}
                className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline mt-1">{t('Open in Mail')}</button>
            )}
            <button type="button" onClick={onClose} aria-label={t('Close')} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            {row(t('From'), who(head.from))}
            {row(t('To'), (head.to || []).map(who).join(', '))}
            {row(t('Cc'), (mail?.cc || []).map(who).join(', '))}
            {row(t('Date'), date)}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {error ? (
            <p className="p-5 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : !mail ? (
            <p className="p-5 text-sm text-gray-400"><Busy label={t('Loading…')} /></p>
          ) : mail.html ? (
            <iframe title={head.subject || 'email'} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={emailDocument(mail.html)} className="w-full h-[65vh] bg-white rounded-b-xl" />
          ) : (
            <pre className="p-5 whitespace-pre-wrap break-words font-sans text-sm text-gray-800 dark:text-gray-200">{mail.text || ''}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
