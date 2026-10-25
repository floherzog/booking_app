import { useMemo, useState, useTransition } from 'react'
import AdvancedPanel from './AdvancedPanel'
import { EMPTY_FILTERS, isEmptyFilters } from '@core/filterRows'

const sel = 'flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100'

const FilterIcon = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

export default function FilterBar({ rows, filters, onChange, onNewVenue, bandOptions, typeOptions, chips, onChipsChange }) {
  const [, startTransition] = useTransition()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const bands     = bandOptions ?? []
  const countries = useMemo(() => [...new Set(rows.map(r => r['Country']).filter(Boolean))].sort(), [rows])
  // The managed list ∪ what's in the rows, so a freshly added type is filterable
  // before any venue uses it. (The memo runs unconditionally — hook order.)
  const rowTypes  = useMemo(() => [...new Set(rows.map(r => r['Type']).filter(Boolean))].sort(), [rows])
  const types     = typeOptions ?? rowTypes

  const advCount = (filters.advanced || []).filter(r => r.field && r.value).length + (filters.sort?.field ? 1 : 0)
  const hasFilters = !isEmptyFilters(filters)
  const clear = () => onChange(EMPTY_FILTERS)

  return (
    <div className="space-y-2">
      {/* Row 1: search + new venue */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Search…"
          value={filters.search || ''}
          onChange={e => { const v = e.target.value; startTransition(() => onChange({ ...filters, search: v })) }}
          className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          onClick={() => setAdvancedOpen(o => !o)}
          title="Advanced filter & sort"
          className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors
            ${advancedOpen || advCount > 0
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
              : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'}`}
        >
          {FilterIcon}
          <span className="hidden sm:inline">Filter / Sort</span>
          {advCount > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 leading-tight">{advCount}</span>
          )}
        </button>
        <button
          onClick={onNewVenue}
          className="shrink-0 flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">New Venue</span>
        </button>
      </div>

      {/* Advanced filter & sort panel */}
      {advancedOpen && <AdvancedPanel rows={rows} filters={filters} onChange={onChange} chips={chips} onChipsChange={onChipsChange} />}

      {/* Row 2: dropdowns + clear */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-2 flex-1 min-w-0">
          <select className={sel} value={filters.band}    onChange={e => onChange({ ...filters, band:    e.target.value, actionOnly: false, nextBatch: false })}>
            <option value="">Band</option>
            {bands.map(b => <option key={b}>{b}</option>)}
          </select>
          <select className={sel} value={filters.country} onChange={e => onChange({ ...filters, country: e.target.value, actionOnly: false, nextBatch: false })}>
            <option value="">Country</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className={sel} value={filters.type}    onChange={e => onChange({ ...filters, type:    e.target.value, actionOnly: false, nextBatch: false })}>
            <option value="">Type</option>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {hasFilters && (
          <button onClick={clear} className="shrink-0 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
