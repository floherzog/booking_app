import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import AdvancedPanel from './AdvancedPanel'
import { EMPTY_FILTERS, isEmptyFilters } from '@core/filterRows'
import { FilterIcon, SelectIcon, MailIcon } from './icons'

const sel = 'flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100'

// Search and the list's actions on the first row — picking venues (Select) and
// writing to them (Email: the bulk dialog; Mac only) next to Filter / Chips
// and + New Venue — and the Band / Country / Type dropdowns on the second.
//
// With `pinned` (Settings ▸ General), a separate bar slides in at the top of
// the window once the first row has scrolled out of view, holding the items
// chosen there (`pinItems`): any of the first row's, Save (the header with the
// big Save button has scrolled away too), the dropdowns and the chips
// (`pinnedChips`). It is fixed rather than sticky, so showing or hiding it
// never moves the page. Its height goes into --pin-top, where the table's
// column headings stick beneath it.
export default function FilterBar({
  rows, filters, onChange, onNewVenue, bandOptions, typeOptions, chips, onChipsChange,
  canSelect = false, selectMode = false, selectedCount = 0, onToggleSelect, onEmail,
  pinned = false, pinItems = {}, pinnedChips = null, editCount = 0, onSave,
}) {
  const [, startTransition] = useTransition()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const barRef = useRef(null)
  const pinRef = useRef(null)
  const [scrolledPast, setScrolledPast] = useState(false)

  // Whether the first row has gone off the top of the window.
  useEffect(() => {
    const el = barRef.current
    if (!pinned || !el) { setScrolledPast(false); return }
    const io = new IntersectionObserver(([e]) => setScrolledPast(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [pinned])

  const showSave = editCount > 0 && onSave
  const barHasItems = pinItems.chips || pinItems.search || (pinItems.select && canSelect) || (pinItems.email && onEmail)
    || pinItems.filter || pinItems.newVenue || pinItems.dropdowns || (pinItems.save && showSave)
  const showBar = pinned && scrolledPast && barHasItems

  useEffect(() => {
    const root = document.documentElement
    const el = pinRef.current
    if (!showBar || !el) { root.style.setProperty('--pin-top', '0px'); return }
    const measure = () => root.style.setProperty('--pin-top', `${el.offsetHeight}px`)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { ro.disconnect(); root.style.setProperty('--pin-top', '0px') }
  }, [showBar])

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

  // The pieces, drawn in the toolbar and again in the pinned bar.
  const search = (
    <input
      type="search"
      placeholder="Search…"
      value={filters.search || ''}
      onChange={e => { const v = e.target.value; startTransition(() => onChange({ ...filters, search: v })) }}
      className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
    />
  )
  const select = canSelect && (
    <button
      onClick={onToggleSelect}
      aria-pressed={selectMode}
      title={selectMode ? 'Leave Select mode' : 'Pick venues: click rows, shift-click a range, or drag across them (on a phone: tap, or press and hold a venue)'}
      className={`${btn} ${selectMode
        ? 'bg-gray-800 border-gray-800 text-white dark:bg-gray-200 dark:border-gray-200 dark:text-gray-900'
        : btnIdle}`}
    >
      <SelectIcon on={selectMode} />
      <span className="hidden sm:inline">{selectMode ? `Done${selectedCount ? ` (${selectedCount})` : ''}` : 'Select'}</span>
    </button>
  )
  const email = onEmail && (
    <button
      onClick={onEmail}
      title={selectMode && selectedCount
        ? `Draft or send to the ${selectedCount} selected venue${selectedCount !== 1 ? 's' : ''}`
        : 'Draft or send to several venues: the next batch, follow-ups, what the filters show, or the venues you select'}
      className={`${btn} bg-white border-indigo-300 text-indigo-700 hover:border-indigo-500 dark:bg-gray-800 dark:border-indigo-700 dark:text-indigo-300 dark:hover:border-indigo-500`}
    >
      <MailIcon />
      <span className="hidden sm:inline">Email{selectMode && selectedCount ? ` ${selectedCount}` : ''}</span>
    </button>
  )
  const filterButton = onClick => (
    <button
      onClick={onClick}
      title="Column filters, sort, and the chips above the list"
      className={`${btn} ${advancedOpen || advCount > 0
        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
        : btnIdle}`}
    >
      <FilterIcon />
      <span className="hidden sm:inline">Filter / Chips</span>
      {advCount > 0 && (
        <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 leading-tight">{advCount}</span>
      )}
    </button>
  )
  const newVenue = (
    <button
      onClick={onNewVenue}
      className="shrink-0 flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
    >
      <span className="text-base leading-none">+</span>
      <span className="hidden sm:inline">New Venue</span>
    </button>
  )
  const save = showSave && (
    <button
      onClick={onSave}
      title="Review and save your changes"
      className="shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
    >
      Save<span className="hidden sm:inline"> {editCount}</span>
    </button>
  )
  const dropdowns = (
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
  )

  // The panel isn't pinned: from the bar, Filter / Chips goes back up to it.
  function openPanelInPlace() {
    setAdvancedOpen(true)
    const top = barRef.current.getBoundingClientRect().top + window.scrollY - 16
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }

  const barRow = pinItems.search || (pinItems.select && select) || (pinItems.email && email) || pinItems.filter || pinItems.newVenue || (pinItems.save && save)

  return (
    <>
      {/* Row 1: search + the list's actions */}
      <div ref={barRef} className="flex gap-2">
        {search}
        {select}
        {email}
        {filterButton(() => setAdvancedOpen(o => !o))}
        {newVenue}
      </div>

      {/* Advanced filter & sort panel */}
      {advancedOpen && (
        <div className="!mt-2">
          <AdvancedPanel rows={rows} filters={filters} onChange={onChange} chips={chips} onChipsChange={onChipsChange} />
        </div>
      )}

      {/* Row 2: dropdowns + clear */}
      <div className="flex flex-wrap gap-2 items-center !mt-2">
        {dropdowns}
        {hasFilters && (
          <button onClick={clear} className="shrink-0 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
            Clear
          </button>
        )}
      </div>

      {showBar && (
        <div
          ref={pinRef}
          data-pinned-bar
          className="!mt-0 fixed top-0 inset-x-0 z-[900] bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 shadow-sm"
        >
          <div className="max-w-[1700px] mx-auto px-4 py-2 space-y-2">
            {pinItems.chips && pinnedChips}
            {barRow && (
              <div className="flex gap-2">
                {pinItems.search ? search : <span className="flex-1" />}
                {pinItems.select && select}
                {pinItems.email && email}
                {pinItems.filter && filterButton(openPanelInPlace)}
                {pinItems.newVenue && newVenue}
                {pinItems.save && save}
              </div>
            )}
            {pinItems.dropdowns && <div className="flex gap-2 items-center">{dropdowns}</div>}
          </div>
        </div>
      )}
    </>
  )
}
