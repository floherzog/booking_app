import { useEffect } from 'react'
import { useT } from '../i18n'

const TONES = {
  info: 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-100',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-100',
  error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200',
}
const CLOSE = {
  info: 'text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200',
  warning: 'text-amber-400 hover:text-amber-700 dark:hover:text-amber-200',
  error: 'text-red-400 hover:text-red-700 dark:hover:text-red-200',
}

// A message in the banner stack at the top of the window, styled like the
// update banner: what mail sync found, a scheduled run that failed, a script
// whose rules drifted. `autoHide` (ms) clears a note that needs nothing from
// you; anything with an action or an error stays until ×.
export default function NoticeBanner({ tone = 'info', children, onDismiss, autoHide = 0 }) {
  const t = useT()
  useEffect(() => {
    if (!autoHide || !onDismiss) return undefined
    const id = setTimeout(onDismiss, autoHide)
    return () => clearTimeout(id)
  }, [autoHide, onDismiss])
  return (
    <div role="status" className={`rounded-lg border shadow-lg text-sm flex items-start gap-3 pl-4 pr-2 py-2.5 ${TONES[tone] || TONES.info}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label={t('Dismiss')} className={`text-lg leading-none px-1.5 shrink-0 ${CLOSE[tone] || CLOSE.info}`}>
          &times;
        </button>
      )}
    </div>
  )
}
