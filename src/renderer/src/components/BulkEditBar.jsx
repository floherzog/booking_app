import { useState } from 'react'
import { normalizeDateText } from '@core/parseDate'
import { MailIcon } from './icons'
import DateInput from './DateInput'
import { fieldLabel } from '@core/constants'

// Fields safe to set across many venues at once. Venue/Email and the read-only
// email counts are intentionally excluded (they're per-venue unique / derived).
const BULK_FIELDS = [
  { key: 'Band', type: 'band' },
  { key: 'Type', type: 'venueType' },
  { key: 'City', type: 'text' },
  { key: 'Country', type: 'text' },
  { key: 'Follow Up Date', type: 'date' },
  { key: 'Last emailed', type: 'date' },
  { key: 'frequency', type: 'frequency' },
  { key: 'Time Frame', type: 'text' },
  { key: 'Dates', type: 'text' },
  { key: 'Note', type: 'text' },
  { key: 'Draft', type: 'bool' },
  { key: 'Auto', type: 'bool' },
].map(f => ({ ...f, label: fieldLabel(f.key) }))

const FREQ_OPTIONS = [
  { v: '', l: 'Default (the type’s, else the Rules’)' },
  { v: '2 months', l: '2 months' },
  { v: '3 months', l: '3 months' },
  { v: '6 months', l: '6 months' },
]

// Default value for a freshly-picked field.
function defaultValue(type) {
  return type === 'bool' ? 'TRUE' : ''
}

export default function BulkEditBar({
  selectedCount, filteredCount, bandOptions = [], typeOptions = [],
  onSelectAllFiltered, onClear, onBulkEdit, onBulkDelete, onEmail, onDone,
}) {
  const [fieldKey, setFieldKey] = useState(BULK_FIELDS[0].key)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const field = BULK_FIELDS.find(f => f.key === fieldKey) || BULK_FIELDS[0]
  const none = selectedCount === 0

  function pickField(key) {
    const f = BULK_FIELDS.find(x => x.key === key) || BULK_FIELDS[0]
    setFieldKey(key)
    setValue(defaultValue(f.type))
    setNote('')
  }

  function apply() {
    if (none) return
    const out = field.type === 'date' ? normalizeDateText(value) : value
    onBulkEdit(field.key, out)
    setNote(`Applied to ${selectedCount} venue${selectedCount !== 1 ? 's' : ''}`)
  }

  const ctrl = 'rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'

  return (
    // Floating at the bottom on a desktop; a full-width sheet on a phone.
    <div className="fixed inset-x-0 bottom-0 sm:bottom-4 z-[1000] flex justify-center sm:px-4 pointer-events-none">
      <div className="pointer-events-auto w-full sm:w-auto flex flex-wrap items-center gap-3 rounded-t-xl sm:rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 max-w-4xl">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{selectedCount}</span>
          <span className="text-gray-500 dark:text-gray-400">selected</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button onClick={onSelectAllFiltered} className="text-indigo-600 dark:text-indigo-400 hover:underline">
            All {filteredCount}
          </button>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <button onClick={onClear} disabled={none} className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-40">
            Clear
          </button>
        </div>

        <div className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Field + value + apply — wraps on a phone instead of running off the edge */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto [&>select]:max-w-full">
          <span className="text-xs text-gray-400 dark:text-gray-500">Set</span>
          <select value={fieldKey} onChange={e => pickField(e.target.value)} className={ctrl}>
            {BULK_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">to</span>

          {field.type === 'band' ? (
            <select value={value} onChange={e => setValue(e.target.value)} className={`${ctrl} max-w-[12rem] min-w-0`}>
              <option value="">— (clear)</option>
              {bandOptions.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : field.type === 'venueType' ? (
            <select value={value} onChange={e => setValue(e.target.value)} className={`${ctrl} max-w-[12rem] min-w-0`}>
              <option value="">— (clear)</option>
              {typeOptions.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : field.type === 'bool' ? (
            <select value={value} onChange={e => setValue(e.target.value)} className={ctrl}>
              <option value="TRUE">Set (TRUE)</option>
              <option value="">Clear</option>
            </select>
          ) : field.type === 'frequency' ? (
            <select value={value} onChange={e => setValue(e.target.value)} className={ctrl}>
              {FREQ_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          ) : field.type === 'date' ? (
            <div className="w-40">
              <DateInput key={field.key} value={value} onCommit={setValue} onTextChange={setValue} className={ctrl} />
            </div>
          ) : (
            <input
              type="text" value={value} onChange={e => setValue(e.target.value)}
              placeholder="value" className={`${ctrl} w-40`}
            />
          )}

          <button
            onClick={apply}
            disabled={none}
            className="bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            Apply
          </button>
        </div>

        {note && <span className="text-xs text-emerald-600 dark:text-emerald-400">{note}</span>}

        <div className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Delete */}
        {confirmDel ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-600 dark:text-red-400">Delete {selectedCount}?</span>
            <button onClick={() => { onBulkDelete(); setConfirmDel(false); setNote('') }} className="font-semibold text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200">Yes</button>
            <span className="text-red-300">·</span>
            <button onClick={() => setConfirmDel(false)} className="text-red-500 hover:text-red-700 dark:hover:text-red-300">No</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            disabled={none}
            className="text-sm text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
          >
            Delete{selectedCount ? ` ${selectedCount}` : ''}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {onEmail && (
            <button
              onClick={onEmail}
              disabled={none}
              title="Draft or send to the selected venues"
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
            >
              <MailIcon /> Email{selectedCount ? ` ${selectedCount}` : ''}
            </button>
          )}
          <button
            onClick={onDone}
            title="Leave Select mode"
            className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
