import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import AdvancedPanel from './AdvancedPanel'
import { EMPTY_FILTERS, isEmptyFilters } from '@core/filterRows'

const sel = 'flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100'

const FilterIcon = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

const SelectIcon = on => (
  <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="2" y="2" width="12" height="12" rx="2.5" />
    {on && <path d="M5 8.2l2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
)

// Search and the list's actions on the first row — picking venues (Select) and
// writing to them (✉ Email: the bulk dialog; Mac only) next to Filter / Chips
// and + New Venue. With `pinned` that row stays at the top of the window while
// the list scrolls (Settings ▸ General), and once it is stuck it also offers
// Save, since the header with the big Save button has scrolled away. Its height
// goes into --pin-top, where the table's column headings stick beneath it.
//
// The rows are rendered straight into the page column (a fragment, not a
// wrapper): a sticky element only sticks inside its parent, and the parent has
// to be the column that holds the list.
export default function FilterBar({
  rows, filters, onChange, onNewVenue, bandOptions, typeOptions, chips, onChipsChange,
  canSelect = false, selectMode = false, selectedCount = 0, onToggleSelect, onEmail,
  pinned = false, editCount = 0, onSave,
}) {
  const [, startTransition] = useTransition()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const barRef = useRef(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const el = barRef.current
    if (!pinned || !el) {
      root.style.setProperty('--pin-top', '0px')
      setStuck(false)
      return
    }
    const measure = () => root.style.setProperty('--pin-top', `${el.offsetHeight}px`)
    const onScroll = () => setStuck(el.getBoundingClientRect().top < 1 && window.scrollY > 0)
    measure()
    onScroll()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      root.style.setProperty('--pin-top', '0px')
    }
  }, [pinned])
  const bands     = bandOptions ?? []
  const countries = useMemo(() => [...new Set(rows.map(r => r['Country']).filter(Boolean))].sort(), [rows])
  // The managed list ∪ what's in the rows, so a freshly added type is filterable
  // before any venue uses it. (The memo runs unconditionally — hook order.)
  const rowTypes  = useMemo(() => [...new Set(rows.map(r => r['Type']).filter(Boolean))].sort(), [rows])
  const types     = typeOptions ?? rowTypes

  const advCount = (filters.advanced || []).filter(r => r.field && r.value).length + (filters.sort?.field ? 1 : 0)
  const hasFilters = !isEmptyFilters(filters)
  const clear = () => onChange(EMPTY_FILTERS)

  const btn = 'shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors'
  const btnIdle = 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'

  return (
    <>
      {/* Row 1: search + the list's actions */}
      <div
        ref={barRef}
        className={`flex gap-2 ${pinned
          ? `sticky top-0 z-[900] -mx-4 px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b transition-shadow ${stuck ? 'border-gray-200 dark:border-gray-800 shadow-sm' : 'border-transparent'}`
          : ''}`}
      >
        <input
          type="search"
          placeholder="Search…"
          value={filters.search || ''}
          onChange={e => { const v = e.target.value; startTransition(() => onChange({ ...filters, search: v })) }}
          className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
        />
        {canSelect && (
          <button
            onClick={onToggleSelect}
            aria-pressed={selectMode}
            title={selectMode ? 'Leave Select mode' : 'Pick venues: click rows, shift-click a range, or drag across them (on a phone: tap, or press and hold a venue)'}
            className={`${btn} ${selectMode
              ? 'bg-gray-800 border-gray-800 text-white dark:bg-gray-200 dark:border-gray-200 dark:text-gray-900'
              : btnIdle}`}
          >
            {SelectIcon(selectMode)}
            <span className="hidden sm:inline">{selectMode ? `Done${selectedCount ? ` (${selectedCount})` : ''}` : 'Select'}</span>
          </button>
        )}
        {onEmail && (
          <button
            onClick={onEmail}
            title={selectMode && selectedCount
              ? `Draft or send to the ${selectedCount} selected venue${selectedCount !== 1 ? 's' : ''}`
              : 'Draft or send to several venues: the next batch, follow-ups, what the filters show, or the venues you select'}
            className={`${btn} bg-white border-indigo-300 text-indigo-700 hover:border-indigo-500 dark:bg-gray-800 dark:border-indigo-700 dark:text-indigo-300 dark:hover:border-indigo-500`}
          >
            <span aria-hidden="true">✉</span>
            <span className="hidden sm:inline">Email{selectMode && selectedCount ? ` ${selectedCount}` : ''}</span>
          </button>
        )}
        <button
          onClick={() => setAdvancedOpen(o => !o)}
          title="Column filters, sort, and the chips above the list"
          className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors
            ${advancedOpen || advCount > 0
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
              : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'}`}
        >
          {FilterIcon}
          <span className="hidden sm:inline">Filter / Chips</span>
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
        {stuck && editCount > 0 && onSave && (
          <button
            onClick={onSave}
            title="Review and save your changes"
            className="shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
          >
            Save<span className="hidden sm:inline"> {editCount}</span>
          </button>
        )}
      </div>

      {/* Advanced filter & sort panel */}
      {advancedOpen && (
        <div className={pinned ? '!mt-0' : '!mt-2'}>
          <AdvancedPanel rows={rows} filters={filters} onChange={onChange} chips={chips} onChipsChange={onChipsChange} />
        </div>
      )}

      {/* Row 2: dropdowns + clear */}
      <div className={`flex flex-wrap gap-2 items-center ${pinned ? '!mt-0' : '!mt-2'}`}>
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
    </>
  )
}
