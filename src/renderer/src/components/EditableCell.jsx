import { useState, useRef, useEffect } from 'react'
import { displayDateText, normalizeDateText } from '@core/parseDate'
import DateInput from './DateInput'

const MULTILINE_FIELDS = ['Note', 'Text', 'Time Frame']

export default function EditableCell({ value, rowIndex, field, edits, onEdit, className = '', isDate = false }) {
  const edited = edits[rowIndex]?.[field]
  const rawValue = edited !== undefined ? edited : (value || '')
  const isEdited = edited !== undefined
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  const displayValue = isDate
    ? displayDateText(rawValue)
    : rawValue

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function commitDate(text) {
    setEditing(false)
    if (text !== normalizeDateText(rawValue)) onEdit(rowIndex, field, text)
  }

  function commitText(val) {
    setEditing(false)
    onEdit(rowIndex, field, val)
  }

  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(e.target.value) }
  }

  const base = `min-h-[1.25rem] cursor-text rounded px-1 -mx-1 transition-colors ${className}`
  const highlight = isEdited
    ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700'
    : 'hover:bg-gray-100 dark:hover:bg-gray-700'

  if (editing) {
    if (isDate) {
      // Wider than the column: a date column is about as wide as "11.09.26",
      // and the field and its calendar button squeezed into that left room for
      // two digits. While editing it spills over the next column, on top.
      return (
        <div className="relative z-10 w-[8.5rem] rounded bg-white dark:bg-gray-800 shadow-sm">
          <DateInput
            value={rawValue}
            autoFocus
            onCommit={commitDate}
            onCancel={() => setEditing(false)}
            className="w-full rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      )
    }
    const sharedText = {
      ref: inputRef,
      defaultValue: rawValue,
      onChange: e => onEdit(rowIndex, field, e.target.value),
      onBlur: e => commitText(e.target.value),
      onKeyDown: handleKey,
      className: 'w-full rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300',
    }
    if (MULTILINE_FIELDS.includes(field)) {
      return <textarea {...sharedText} rows={3} style={{ resize: 'vertical' }} />
    }
    return <input type="text" {...sharedText} />
  }

  return (
    <div className={`${base} ${highlight}`} onClick={e => { e.stopPropagation(); setEditing(true) }} title="Click to edit">
      {displayValue || <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
    </div>
  )
}
