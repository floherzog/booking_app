import { useState, useRef, useEffect, useCallback } from 'react'
import { normalizeDateText, displayDateText, parseDate, formatDateDDMMYY } from '@core/parseDate'
import CalendarPopover from './CalendarPopover'
import { useDateOrder } from '../lib/dateOrder'
import { t, useT } from '../i18n'

// A date you can type — "12.03.26", "12.3.2026", "September 2026", "2027" — or
// pick from the calendar behind the button. A day is stored as dd.MM.yy, just
// as the picker would; anything vaguer is stored as typed. The field shows and
// reads days in the chosen date order (lib/dateOrder.js), so with month first
// "11/01/26" is 1 November; `value` and onCommit are always the stored form.
//
// onCommit(text) on Enter, on leaving the field and on picking a day; onCancel
// on Escape (without one, Escape puts the value back). onTextChange, if given,
// hears every keystroke — for a form that reads the field without waiting.
// The calendar (CalendarPopover) opens under the field and never takes focus,
// so moving around in it does not count as leaving the field. The calendar
// button sits inside the field's outline — or, `stacked`, outlined under it,
// for a narrow table column the field then fills; width classes in
// `className` size the whole box.
export default function DateInput({ id, value, onCommit, onCancel, onTextChange, autoFocus = false, className = '', placeholder, stacked = false }) {
  const t = useT()
  const order = useDateOrder()
  const [text, setText] = useState(() => displayDateText(value || ''))
  const [calendar, setCalendar] = useState(false)
  const committed = useRef(value || '')
  const textRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if ((value || '') !== committed.current) {
      committed.current = value || ''
      setText(displayDateText(value || ''))
    }
  }, [value])

  useEffect(() => {
    if (autoFocus) textRef.current?.focus()
  }, [autoFocus])

  function commit(raw) {
    const next = normalizeDateText(raw)
    committed.current = next
    setText(displayDateText(next))
    onCommit(next)
  }

  const closeCalendar = useCallback(() => setCalendar(false), [])
  function pick(day) {
    setCalendar(false)
    commit(formatDateDDMMYY(day))
  }

  // Width classes size the box (field and button together); the rest style the field.
  const widths = className.split(/\s+/).filter(c => /^(max-|min-)?w-/.test(c)).join(' ')
  const fieldClass = className.split(/\s+/).filter(c => !/^(max-|min-)?w-/.test(c)).join(' ')

  return (
    <div
      ref={boxRef}
      className={`relative flex ${stacked ? 'flex-col items-start gap-1' : 'items-center'} ${widths}`}
      onClick={e => e.stopPropagation()}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) commit(text) }}
    >
      <input
        ref={textRef}
        id={id}
        type="text"
        value={text}
        placeholder={placeholder ?? (order === 'mdy' ? t('mm/dd/yy or month') : t('dd.mm.yy or month'))}
        onChange={e => { setText(e.target.value); onTextChange?.(e.target.value) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); setCalendar(false); commit(text) }
          // Escape closes the calendar first, then undoes typing; with nothing
          // to undo it is left to close the dialog the field sits in (useEscape).
          if (e.key === 'Escape' && calendar) { e.preventDefault(); setCalendar(false); return }
          if (e.key === 'Escape' && (onCancel || text !== displayDateText(committed.current))) {
            e.preventDefault()
            if (onCancel) onCancel()
            else setText(displayDateText(committed.current))
          }
        }}
        className={`w-full min-w-0 ${stacked ? '' : 'pr-7'} ${fieldClass}`}
      />
      <button
        type="button"
        tabIndex={-1}
        title={t("Pick a day")}
        aria-label={t("Pick a day")}
        aria-expanded={calendar}
        // Keep the typing focus in the field.
        onMouseDown={e => e.preventDefault()}
        onClick={() => { setCalendar(o => !o); textRef.current?.focus() }}
        className={stacked
          ? `rounded border px-2 py-0.5 ${calendar ? 'border-indigo-400 text-indigo-600 dark:border-indigo-500 dark:text-indigo-400' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600'}`
          : `absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 ${calendar ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200'}`}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
      </button>
      {calendar && boxRef.current && (
        <CalendarPopover
          anchor={boxRef.current}
          selected={parseDate(normalizeDateText(text)) || null}
          onPick={pick}
          onClose={closeCalendar}
        />
      )}
    </div>
  )
}
