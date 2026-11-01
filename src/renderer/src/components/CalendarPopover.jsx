import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT, getLanguage } from '../i18n'
import { useDateOrder } from '../lib/dateOrder'

const WIDTH = 248
const HEIGHT = 300 // about; only for deciding whether it fits below

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// The month grid behind DateInput's calendar button: underneath the field
// (above it when there's no room below), in a portal so no table cell or
// dialog clips it. Nothing in it takes focus — every button keeps the typing
// focus in the field (mousedown is cancelled) — so moving between months never
// counts as leaving the field, which in the table would close the cell.
// onPick(date) for a day; onClose for Escape (the field forwards it), a click
// elsewhere, or the page scrolling away under it.
export default function CalendarPopover({ anchor, selected, onPick, onClose }) {
  const t = useT()
  const order = useDateOrder()
  const today = new Date()
  const [month, setMonth] = useState(() => {
    const d = selected || today
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [pos, setPos] = useState(null)
  const ref = useRef(null)

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > HEIGHT + 8 || r.top < HEIGHT + 8
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
      top: below ? r.bottom + 4 : r.top - 4,
      above: !below,
    })
  }, [anchor])

  useEffect(() => {
    const outside = e => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose() }
    const scrolled = e => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', outside, true)
    window.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', outside, true)
      window.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  const lang = getLanguage()
  const sundayFirst = order === 'mdy'
  const first = (month.getDay() + 7 - (sundayFirst ? 0 : 1)) % 7 // blank cells before the 1st
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  // Weekday initials in the UI language, starting where the week does.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, (sundayFirst ? 7 : 1) + i)
    .toLocaleDateString(lang, { weekday: 'short' }).slice(0, 2))
  const title = month.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
  const keep = e => e.preventDefault() // the field keeps focus
  const step = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const nav = 'w-7 h-7 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 text-lg leading-none'

  if (!pos) return null
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('Pick a day')}
      data-calendar
      onMouseDown={keep}
      onClick={e => e.stopPropagation()}
      style={{ left: pos.left, top: pos.top, width: WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}
      className="fixed z-[1500] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-2 text-sm select-none"
    >
      <div className="flex items-center justify-between mb-1">
        <button type="button" tabIndex={-1} onClick={() => step(-1)} className={nav} aria-label={t('Previous month')}>‹</button>
        <span className="font-medium text-gray-800 dark:text-gray-100">{title}</span>
        <button type="button" tabIndex={-1} onClick={() => step(1)} className={nav} aria-label={t('Next month')}>›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">
        {weekdays.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => d ? (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(d)}
            className={`h-8 rounded-md tabular-nums ${sameDay(d, selected)
              ? 'bg-indigo-600 text-white font-semibold'
              : sameDay(d, today)
                ? 'ring-1 ring-indigo-400 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            {d.getDate()}
          </button>
        ) : <span key={i} />)}
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" tabIndex={-1} onClick={() => onPick(new Date())}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline px-1 py-0.5">{t('Today')}</button>
      </div>
    </div>,
    document.body,
  )
}
