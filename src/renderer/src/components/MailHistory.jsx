import { useContext, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { MailContext, getHistory, newerThanCsv, messageKey } from '../lib/mailHistory'
import Busy from './Busy'
import { formatDay } from '@core/parseDate'
import { useDateOrder } from '../lib/dateOrder'
import { bandOfMessage } from '@core/bandNames'
import { cachedText, preloadMail } from '../lib/mailBodies'
import { useDrafts, dropDraft, refreshDrafts } from '../lib/mailDrafts'
import { draftAddresses } from '@core/draftMatch'
import { emailAddresses } from '@core/constants'
import { PencilIcon } from './icons'
import DraftEditor from './DraftEditor'

// Bodies read ahead once the list is in, newest first and a few at a time, so
// the newest open at once. Kept in memory only (lib/mailBodies.js): gone when
// the app quits, nothing is written to disk.
const AHEAD = 100
const BATCH = 5

// Under the map in a venue's details: every email from and to its address,
// newest first, folded away until opened. Not there at all without a mailbox
// to ask or without any messages.
// `lastEmailed` / `lastReply`: the venue's dates as the CSV (with staged edits)
// has them; a newer mail is marked, and counted in the folded heading.
// Each message shows the band it is about instead of its subject (`bands`:
// every band in Settings): named in the subject, else in the text. When it
// names none, several, or a name misspelled, the subject shows after all.
// With several bands (`band`: the one shown), only that band's mail can be
// newer than its dates. Drafts waiting in the Drafts mailbox to this address
// come first: click to read, the pencil edits.
export default function MailHistory({ email, lastEmailed = '', lastReply = '', bands = [], band = '', severalBands = false }) {
  const t = useT()
  const mail = useContext(MailContext)
  useDateOrder()
  const [messages, setMessages] = useState(null)
  const [open, setOpen] = useState(false)
  const [, setBodiesRead] = useState(0)
  const [editing, setEditing] = useState(null) // the draft open in DraftEditor
  const { drafts: allDrafts } = useDrafts()
  const mine = new Set(emailAddresses(email).map(a => a.toLowerCase()))
  const drafts = (allDrafts || []).filter(d => draftAddresses(d).some(a => mine.has(a)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  useEffect(() => {
    if (!mail.ready || !email?.trim()) return undefined
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null)
    getHistory(email).then(m => { if (alive) setMessages(m) })
    return () => { alive = false }
  }, [mail.ready, email])

  // The list first; then the bodies, newest first, a few at a time. They also
  // say which band a message is about when its subject doesn't.
  useEffect(() => {
    if (!messages?.length) return undefined
    let alive = true
    ;(async () => {
      const todo = messages.slice(0, AHEAD)
      for (let i = 0; i < todo.length && alive; i += BATCH) {
        await preloadMail(todo.slice(i, i + BATCH))
        if (alive) setBodiesRead(n => n + 1)
      }
    })()
    return () => { alive = false }
  }, [messages])

  if (!mail.ready || !email?.trim()) return null
  // Asking the mailbox can take a few seconds; say so rather than show nothing.
  if (messages === null) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400"><Busy label={t('Fetching emails…')} /></p>
    )
  }
  if (!messages.length && !drafts.length) return null
  const bandOf = m => (bands.length ? bandOfMessage({ subject: m.subject, text: cachedText(m) }, bands) : null)
  const newer = newerThanCsv(severalBands && band ? messages.filter(m => bandOf(m) === band) : messages, { lastEmailed, lastReply })
  const sent = messages.filter(m => m.direction === 'out').length
  const received = messages.length - sent
  // The app's own date order (Settings ▸ General), like every other date in
  // it — not the Mac's region format.
  const day = d => (d ? formatDay(new Date(d)) : '')
  return (
    <section>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        {t('Emails')}
        {drafts.length > 0 && (
          <span className="normal-case tracking-normal font-medium text-blue-600 dark:text-blue-400" title={t('{n} draft waiting in Mail|{n} drafts waiting in Mail', { n: drafts.length })}>✎ {drafts.length}</span>
        )}
        {/* Sent and received apart, in the colours of the list below. */}
        <span className="normal-case tracking-normal font-medium text-indigo-500 dark:text-indigo-400" title={t('{n} sent', { n: sent })}>↗ {sent}</span>
        <span className="normal-case tracking-normal font-medium text-emerald-600 dark:text-emerald-400" title={t('{n} received', { n: received })}>↙ {received}</span>
        {newer.size > 0 && (
          <span className="normal-case tracking-normal font-medium text-amber-700 dark:text-amber-400">· {t('{n} newer than the CSV', { n: newer.size })}</span>
        )}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700">
          {drafts.map(d => (
            <li key={`draft-${messageKey(d)}`} className="flex items-center">
              <button type="button" onClick={() => mail.openMessage(d)} title={t('Read this draft')}
                className="min-w-0 flex-1 text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-baseline gap-3 text-sm">
                <span className="shrink-0 w-[5.5rem] text-xs font-medium whitespace-nowrap text-blue-600 dark:text-blue-400">✎ {t('Draft#mail')}</span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{day(d.date)}</span>
                {bandOf(d)
                  ? <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-200" title={d.subject}>{bandOf(d)}</span>
                  : <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">{d.subject || t('(no subject)')}</span>}
              </button>
              <button type="button" onClick={() => setEditing(d)} title={t('Edit this draft')} aria-label={t('Edit this draft')}
                className="shrink-0 mr-2 p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
          {messages.map(m => (
            <li key={messageKey(m)}>
              <button type="button" onClick={() => mail.openMessage(m)} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-baseline gap-3 text-sm">
                <span className={`shrink-0 w-[5.5rem] text-xs font-medium whitespace-nowrap ${m.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-500 dark:text-indigo-400'}`}>
                  {m.direction === 'in' ? `↙ ${t('Received')}` : `↗ ${t('Sent#mail')}`}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{day(m.date)}</span>
                {bandOf(m)
                  ? <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-200" title={m.subject}>{bandOf(m)}</span>
                  : <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">{m.subject || t('(no subject)')}</span>}
                {newer.has(messageKey(m)) && (
                  <span className="shrink-0 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 text-amber-800 dark:text-amber-300"
                    title={m.direction === 'out' ? t('Sent after the Last emailed date in the CSV') : t('Received after the reply date in the CSV')}>
                    {t('Newer than CSV')}
                  </span>
                )}
                {m.auto && <span className="shrink-0 text-[11px] rounded bg-gray-100 dark:bg-gray-700 px-1.5 text-gray-500 dark:text-gray-400">{t('auto-reply')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <DraftEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { dropDraft(editing); setEditing(null); refreshDrafts() }}
        />
      )}
    </section>
  )
}
