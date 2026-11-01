import { useContext, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { MailContext, getHistory } from '../lib/mailHistory'
import { SpinnerIcon } from './icons'
import { formatDay } from '@core/parseDate'
import { useDateOrder } from '../lib/dateOrder'

// Under the map in a venue's details: every email from and to its address,
// newest first, folded away until opened. Not there at all without a mailbox
// to ask or without any messages.
export default function MailHistory({ email }) {
  const t = useT()
  const mail = useContext(MailContext)
  useDateOrder()
  const [messages, setMessages] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!mail.ready || !email?.trim()) return undefined
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null)
    getHistory(email).then(m => { if (alive) setMessages(m) })
    return () => { alive = false }
  }, [mail.ready, email])

  if (!mail.ready || !email?.trim()) return null
  // Asking the mailbox can take a few seconds; say so rather than show nothing.
  if (messages === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400" role="status">
        <SpinnerIcon />
        {t('Fetching emails…')}
      </p>
    )
  }
  if (!messages.length) return null
  // The app's own date order (Settings ▸ General), like every other date in
  // it — not the Mac's region format.
  const day = d => (d ? formatDay(new Date(d)) : '')
  return (
    <section>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        {t('Emails ({n})', { n: messages.length })}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700">
          {messages.map(m => (
            <li key={`${m.accountId}|${m.mailbox}|${m.uid}`}>
              <button type="button" onClick={() => mail.openMessage(m)} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-baseline gap-3 text-sm">
                <span className={`shrink-0 w-[5.5rem] text-xs font-medium whitespace-nowrap ${m.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-500 dark:text-indigo-400'}`}>
                  {m.direction === 'in' ? `↙ ${t('Received')}` : `↗ ${t('Sent#mail')}`}
                </span>
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">{day(m.date)}</span>
                <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{m.subject || t('(no subject)')}</span>
                {m.auto && <span className="shrink-0 text-[11px] rounded bg-gray-100 dark:bg-gray-700 px-1.5 text-gray-500 dark:text-gray-400">{t('auto-reply')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
