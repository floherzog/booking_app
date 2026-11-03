import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { onScroll, scrollY, scrollToY } from '../lib/windowChrome'
import { ArrowUpIcon } from './icons'

// Back to the first venue and the menu.
// Shows once the list has been scrolled some way down, below the column
// headings that stick under the toolbar.
// Moved frame by frame rather than with scrollTo's 'smooth': the list measures
// the rows it draws on the way up and corrects the position, which stops a
// smooth scroll dead.
function scrollToTop() {
  const from = scrollY()
  if (!from || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { scrollToY(0); return }
  const start = performance.now()
  const ms = 300
  const step = now => {
    const p = Math.min(1, (now - start) / ms)
    scrollToY(Math.round(from * (1 - p) ** 3))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export default function BackToTop() {
  const t = useT()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const update = () => setShow(scrollY() > 400)
    update()
    return onScroll(update)
  }, [])
  if (!show) return null
  return (
    <button
      type="button"
      onClick={scrollToTop}
      title={t('Back to the top of the list')}
      aria-label={t('Back to the top of the list')}
      style={{ top: 'calc(var(--chrome-top, 0px) + var(--pin-top, 0px) + 4rem)' }}
      className={`fixed right-6 z-[950] inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-md hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors`}
    >
      <ArrowUpIcon className="w-3.5 h-3.5" />
      {t('Top')}
    </button>
  )
}
