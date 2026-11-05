import { useContext, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { MailContext, getHistory, newerThanCsv, messageKey } from '../lib/mailHistory'
import Busy from './Busy'
import { formatDay } from '@core/parseDate'
import { useDateOrder } from '../lib/dateOrder'
import { bandsNamed, bandOfMessage } from '@core/bandNames'
import { cachedMail, cachedText, preloadMail } from '../lib/mailBodies'

// Under the map in a venue's details: every email from and to its address,
// newest first, folded away until opened. Not there at all without a mailbox
// to ask or without any messages.
// `lastEmailed` / `lastReply`: the venue's dates as the CSV (with staged edits)
// has them; a newer mail is marked, and counted in the folded heading.
// Each message shows the band it is about instead of its subject (`bands`:
// every band in Settings): named in the subject, else in the text. When it
// names none, several, or a name misspelled, the subject shows after all.
// With several bands (`band`: the one shown), only that band's mail can be
// newer than its dates.
export default function MailHistory({ email, lastEmailed = '', lastReply = '', bands = [], band = '', severalBands = false }) {
  const t = useT()
  const mail = useContext(MailContext)
  useDateOrder()
  const [messages, setMessages] = useState(null)
  const [open, setOpen] = useState(false)
  const [, setBodiesRead] = useState(0)

  useEffect(() => {
    if (!mail.ready || !email?.trim()) return undefined
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null)
    getHistory(email).then(m => { if (alive) setMessages(m) })
    return () => { alive = false }
  }, [mail.ready, email])

  // Opened: the bodies of the messages whose subject names no band are read,
  // to look for the band there.
  const bandsKey = bands.join('|')
  useEffect(() => {
    if (!open || !messages?.length || !bands.length) return undefined
    const todo = messages.filter(m => !bandsNamed(m.subject, bands).length && !cachedMail(m))
    if (!todo.length) return undefined
    let alive = true
    preloadMail(todo).then(() => { if (alive) setBodiesRead(n => n + 1) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, bandsKey])

  if (!mail.ready || !email?.trim()) return null
  // Asking the mailbox can take a few seconds; say so rather than show nothing.
  if (messages === null) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400"><Busy label={t('Fetching emails…')} /></p>
    )
  }
  if (!messages.length) return null
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
        {/* Sent and received apart, in the colours of the list below. */}
        <span className="normal-case tracking-normal font-medium text-indigo-500 dark:text-indigo-400" title={t('{n} sent', { n: sent })}>↗ {sent}</span>
        <span className="normal-case tracking-normal font-medium text-emerald-600 dark:text-emerald-400" title={t('{n} received', { n: received })}>↙ {received}</span>
        {newer.size > 0 && (
          <span className="normal-case tracking-normal font-medium text-amber-700 dark:text-amber-400">· {t('{n} newer than the CSV', { n: newer.size })}</span>
        )}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700">
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
    </section>
  )
}
