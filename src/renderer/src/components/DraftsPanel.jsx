import { useContext, useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { api } from '../platform'
import { useDrafts, refreshDrafts, dropDraft, draftRefKey } from '../lib/mailDrafts'
import { MailContext } from '../lib/mailHistory'
import { matchDrafts } from '@core/draftMatch'
import { formatDay } from '@core/parseDate'
import { useDateOrder } from '../lib/dateOrder'
import Busy from './Busy'
import { useDragTick } from '../lib/useDragTick'
import { CheckIcon, PencilIcon, RefreshIcon, SendIcon, TrashIcon } from './icons'

// "Current drafts", beside "Create / send email" in the Email window: the
// drafts waiting in the Drafts mailbox for venues in the CSV (a draft to an
// address the CSV doesn't have is left out). Each can be read, opened in Mail
// to edit, sent as it is, or deleted for good — one at a time or ticked
// together, the ticked ones all in one go (main/ipc/mailDrafts.js sends them
// side by side). A sent draft is recorded on its venue like any other send.
// The venue's name opens the venue (`onOpenVenue`, over this window).
export default function DraftsPanel({ rows, settings, mailReady, onSent, onOpenVenue, onOpenSettings }) {
  const t = useT()
  useDateOrder()
  const mail = useContext(MailContext)
  const { drafts, loading, error } = useDrafts()
  const [ticked, setTicked] = useState(() => new Set())
  const [busy, setBusy] = useState(() => new Set()) // keys being sent or deleted
  const [done, setDone] = useState({}) // key → { ok, action, error }
  const [confirm, setConfirm] = useState(null) // { action: 'send' | 'delete', keys }

  // The list is fetched when the app starts (App.jsx), so it is usually here
  // already; opening the window checks again in the background, keeping the
  // list on screen meanwhile.
  useEffect(() => { if (mailReady) refreshDrafts() }, [mailReady])

  const matched = useMemo(() => matchDrafts(drafts || [], rows, settings), [drafts, rows, settings])
  const keys = matched.map(m => draftRefKey(m.draft))
  // Ticks for drafts that have gone (sent, deleted, or gone from the server) drop away.
  const live = new Set(keys)
  const tickedLive = [...ticked].filter(k => live.has(k))
  const allTicked = keys.length > 0 && tickedLive.length === keys.length

  // Press a box and drag across the drafts to tick or untick many at once.
  const tick = useDragTick(
    key => ticked.has(key),
    (key, on) => {
      setTicked(prev => {
        if (prev.has(key) === on) return prev
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
      })
      setConfirm(null)
    },
  )

  async function run(action, list) {
    setConfirm(null)
    const items = list.map(key => matched.find(m => draftRefKey(m.draft) === key)).filter(Boolean)
    if (!items.length) return
    const refOf = item => ({ accountId: item.draft.accountId, mailbox: item.draft.mailbox, uid: item.draft.uid })
    const keysOf = new Set(items.map(item => draftRefKey(item.draft)))
    setBusy(prev => new Set([...prev, ...keysOf]))
    let results
    try {
      results = await (action === 'send' ? api.sendDrafts(items.map(refOf)) : api.deleteDrafts(items.map(refOf)))
    } catch (e) {
      results = items.map(item => ({ ...refOf(item), error: e.message }))
    }
    const next = {}
    items.forEach((item, i) => {
      const key = draftRefKey(item.draft)
      const r = results?.[i] || { error: t('No answer from the mail server.') }
      if (r.error) { next[key] = { ok: false, action, error: r.error }; return }
      if (action === 'send') item.rows.forEach(row => onSent?.(row))
      // Sent, but still in Drafts: say so, or it would be sent twice.
      const note = action === 'send' && r.removed === false ? t('Sent — but it is still in Drafts. Delete it there, so it doesn’t go out twice.') : ''
      next[key] = { ok: true, action, note }
      if (action === 'delete' || r.removed !== false) dropDraft(refOf(item))
    })
    setDone(prev => ({ ...prev, ...next }))
    setBusy(prev => new Set([...prev].filter(k => !keysOf.has(k))))
    setTicked(new Set())
    refreshDrafts()
  }

  function ask(action, list) {
    if (confirm?.action === action && confirm.keys.join() === list.join()) run(action, list)
    else setConfirm({ action, keys: list })
  }
  const isAsking = (action, list) => confirm?.action === action && confirm.keys.join() === list.join()

  const openInMail = d => api.openExternal(`message://${encodeURIComponent(d.messageId)}`)
  const day = d => (d ? formatDay(new Date(d)) : '')
  const iconBtn = 'shrink-0 p-1.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-30'
  const anyBusy = busy.size > 0
  const finished = Object.entries(done).filter(([, r]) => r.ok)

  let body
  if (!mailReady) {
    body = (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
        {t('Drafts show here once a mail account is set up.')}
        {onOpenSettings && <button onClick={() => onOpenSettings('mail')} className="ml-1 font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{t('Mail settings')}</button>}
      </p>
    )
  } else if (drafts === null) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center"><Busy label={t('Looking for drafts…')} /></p>
  } else if (!matched.length) {
    body = <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{t('No drafts to venues in your Drafts mailbox.')}</p>
  } else {
    body = (
      <ul className="space-y-1.5">
        {matched.map(({ draft, rows: venueRows }) => {
          const key = draftRefKey(draft)
          const row = venueRows[0]
          const result = done[key]
          const working = busy.has(key)
          const to = [...draft.to, ...draft.cc].map(p => p.address).join(', ')
          const drag = tick(key, { enabled: !anyBusy })
          return (
            <li key={key} {...drag.row} className="rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <input type="checkbox" {...drag.box} disabled={anyBusy}
                  aria-label={t('Select this draft')}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                    {onOpenVenue
                      ? <button type="button" onClick={() => onOpenVenue(row._idx)} title={t('Open this venue')} className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">{row['Venue'] || '—'}</button>
                      : (row['Venue'] || '—')}
                    {row['City'] && <span className="text-gray-400 dark:text-gray-500"> · {row['City']}</span>}
                    {venueRows.length > 1
                      ? <span className="text-gray-400 dark:text-gray-500"> · {venueRows.map(r => r['Band']).filter(Boolean).join(', ')}</span>
                      : row['Band'] && <span className="text-gray-400 dark:text-gray-500"> · {row['Band']}</span>}
                  </p>
                  <button type="button" onClick={() => mail.openMessage(draft)} title={t('Read this draft')}
                    className="block w-full text-left text-xs text-gray-600 dark:text-gray-300 truncate hover:text-indigo-600 dark:hover:text-indigo-400">
                    {draft.subject || t('(no subject)')}
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{to} · {day(draft.date)}</p>
                  {result && !result.ok && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{result.error}</p>}
                  {result?.note && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{result.note}</p>}
                </div>
                {working ? <span className="shrink-0 p-1.5 text-gray-500"><Busy /></span> : (
                  <div className="shrink-0 flex items-center">
                    {draft.messageId && (
                      <button type="button" onClick={() => openInMail(draft)} disabled={anyBusy} className={iconBtn} title={t('Edit in Mail')} aria-label={t('Edit in Mail')}>
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => ask('send', [key])} disabled={anyBusy}
                      className={isAsking('send', [key]) ? 'shrink-0 rounded px-1.5 py-1 text-xs font-medium bg-rose-600 text-white' : iconBtn}
                      title={t('Send this draft now')} aria-label={t('Send this draft now')}>
                      {isAsking('send', [key]) ? t('Send?') : <SendIcon className="w-3.5 h-3.5" />}
                    </button>
                    <button type="button" onClick={() => ask('delete', [key])} disabled={anyBusy}
                      className={isAsking('delete', [key]) ? 'shrink-0 rounded px-1.5 py-1 text-xs font-medium bg-red-600 text-white' : iconBtn}
                      title={t('Delete this draft for good')} aria-label={t('Delete this draft for good')}>
                      {isAsking('delete', [key]) ? t('Delete?') : <TrashIcon className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  const sentCount = finished.filter(([, r]) => r.action === 'send').length
  const deletedCount = finished.filter(([, r]) => r.action === 'delete').length

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 pr-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('Current drafts')}</h2>
        {matched.length > 0 && <span className="text-sm text-gray-400 dark:text-gray-500">{matched.length}</span>}
        {mailReady && (
          <button type="button" onClick={() => refreshDrafts()} disabled={loading || anyBusy} className={iconBtn} title={t('Look again')} aria-label={t('Look again')}>
            {loading ? <Busy /> : <RefreshIcon className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {matched.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mr-auto">
            <input type="checkbox" checked={allTicked} disabled={anyBusy}
              onChange={() => { setTicked(allTicked ? new Set() : new Set(keys)); setConfirm(null) }}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
            {tickedLive.length ? t('{n} selected', { n: tickedLive.length }) : t('Select all')}
          </label>
          {/* Always laid out, only shown once something is ticked: ticking a
              draft never moves the list. */}
          <div className={`flex items-center gap-2 ${tickedLive.length ? '' : 'invisible'}`} aria-hidden={!tickedLive.length}>
            <>
              <button type="button" onClick={() => ask('delete', tickedLive)} disabled={anyBusy || !tickedLive.length}
                className={`text-xs font-medium px-2.5 py-1 rounded-md border ${isAsking('delete', tickedLive) ? 'bg-red-600 border-red-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-red-400 hover:text-red-600'}`}>
                {isAsking('delete', tickedLive) ? t('Really delete {n}?', { n: tickedLive.length }) : t('Delete {n}', { n: tickedLive.length })}
              </button>
              <button type="button" onClick={() => ask('send', tickedLive)} disabled={anyBusy || !tickedLive.length}
                className={`text-xs font-medium px-2.5 py-1 rounded-md text-white ${isAsking('send', tickedLive) ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {isAsking('send', tickedLive) ? t('Really send {n}?', { n: tickedLive.length }) : t('Send {n}', { n: tickedLive.length })}
              </button>
            </>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
        {body}
      </div>
      {(sentCount > 0 || deletedCount > 0) && (
        <p className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <CheckIcon className="w-3.5 h-3.5 text-green-600" />
          {[sentCount && t('{n} sent', { n: sentCount }), deletedCount && t('{n} deleted', { n: deletedCount })].filter(Boolean).join(' · ')}
          {sentCount > 0 && (settings?.mail?.sync?.lastEmailed || 'onSend') !== 'off' && <span> — {t('press Save to write the new dates to the CSV.')}</span>}
        </p>
      )}
    </div>
  )
}
