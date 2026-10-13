import { useState, useRef, useEffect } from 'react'
import { normalizeDateText, toInputValue, fromInputValue } from '@core/parseDate'

// About as wide as the browser's own calendar (Chromium's is the widest).
const PICKER_WIDTH = 260

// A date you can type — "12.03.26", "12.3.2026", "September 2026", "2027" — or
// pick from the calendar behind the button. A day is stored as dd.MM.yy, just
// as the picker would; anything vaguer is stored as typed.
//
// onCommit(text) on Enter, on leaving the field and on picking a day; onCancel
// on Escape (without one, Escape puts the value back). onTextChange, if given,
// hears every keystroke — for a form that reads the field without waiting.
// The calendar is a hidden <input type="date"> inside this component, so
// moving to it does not count as leaving the field.
export default function DateInput({ id, value, onCommit, onCancel, onTextChange, autoFocus = false, className = '', placeholder = 'dd.mm.yy or month' }) {
  const [text, setText] = useState(value || '')
  const committed = useRef(value || '')
  const textRef = useRef(null)
  const pickerRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if ((value || '') !== committed.current) {
      committed.current = value || ''
      setText(value || '')
    }
  }, [value])

  useEffect(() => {
    if (autoFocus) textRef.current?.focus()
  }, [autoFocus])

  function commit(raw) {
    const next = normalizeDateText(raw)
    committed.current = next
    setText(next)
    onCommit(next)
  }

  function openPicker() {
    const el = pickerRef.current
    if (!el) return
    el.value = toInputValue(text)
    // Safari opens its calendar from the hidden input's left edge rightwards and
    // never pulls it back on screen — beside the window's right edge it ran off.
    // So the input moves under the field's left edge, or as far left as it takes
    // for the calendar to fit the window. Set here, not rendered: it has to be in
    // place before showPicker() below.
    const box = boxRef.current?.getBoundingClientRect()
    if (box) {
      const left = Math.max(8, Math.min(box.left, window.innerWidth - PICKER_WIDTH - 8))
      el.style.left = `${left - box.left}px`
    }
    el.focus()
    try { el.showPicker() } catch { /* not supported: the field still takes typing */ }
  }

  return (
    <div
      ref={boxRef}
      className="relative flex items-center gap-1"
      onClick={e => e.stopPropagation()}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) commit(text) }}
    >
      <input
        ref={textRef}
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        onChange={e => { setText(e.target.value); onTextChange?.(e.target.value) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text) }
          if (e.key === 'Escape') {
            e.preventDefault()
            if (onCancel) onCancel()
            else setText(committed.current)
          }
        }}
        className={`min-w-0 flex-1 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        title="Pick a day"
        aria-label="Pick a day"
        // Keep the typing focus until the click has opened the calendar.
        onMouseDown={e => e.preventDefault()}
        onClick={openPicker}
        className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => { if (e.target.value) commit(fromInputValue(e.target.value)) }}
        className="absolute bottom-0 w-6 h-6 opacity-0 pointer-events-none"
      />
    </div>
  )
}
