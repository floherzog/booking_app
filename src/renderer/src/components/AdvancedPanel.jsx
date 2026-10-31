import { useMemo, useState } from 'react'
import { ADVANCED_COLUMNS, STATUS_META, HEALTH_OPTIONS } from '@core/constants'
import { SHORTCUTS, describeFilters, isEmptyFilters, EMPTY_FILTERS } from '@core/filterRows'
import { ORDERED_STATUSES, StatusPill, ShortcutChip, CustomChip, columnLabel } from './StatsBar'

const sel = 'rounded-md border-gray-300 dark:border-gray-600 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100'

// Classified-status options, ordered by the same priority as the badges.
const STATUS_OPTIONS = Object.entries(STATUS_META)
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([key, meta]) => ({ key, label: meta.label }))

// Field dropdowns list columns alphabetically by label.
const SORTED_COLUMNS = [...ADVANCED_COLUMNS].sort((a, b) => a.label.localeCompare(b.label))

export default function AdvancedPanel({ rows, filters, onChange, chips, onChipsChange }) {
  const advanced = filters.advanced || []
  const sort = filters.sort || { field: '', dir: 'asc' }

  // Distinct non-empty values per text column, for autocomplete datalists.
  const distinct = useMemo(() => {
    const map = {}
    ADVANCED_COLUMNS.forEach(c => {
      if (c.key === '_status' || c.type === 'health' || c.type === 'date') return
      const set = new Set()
      for (const r of rows) {
        const v = (r[c.key] || '').trim()
        if (v) set.add(v)
      }
      map[c.key] = [...set].sort((a, b) => a.localeCompare(b)).slice(0, 300)
    })
    return map
  }, [rows])

  const setAdvanced = next => onChange({ ...filters, advanced: next })
  const updateRule = (i, patch) => setAdvanced(advanced.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRule = () => setAdvanced([...advanced, { field: 'Contact', value: '' }])
  const removeRule = i => setAdvanced(advanced.filter((_, j) => j !== i))
  const setSort = patch => onChange({ ...filters, sort: { ...sort, ...patch } })

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3 space-y-3">
      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-14 shrink-0">Sort by</span>
        <select className={sel} value={sort.field} onChange={e => setSort({ field: e.target.value })}>
          <option value="">— None (default) —</option>
          {SORTED_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className={`flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-xs ${sort.field ? '' : 'opacity-40 pointer-events-none'}`}>
          {['asc', 'desc'].map(dir => (
            <button
              key={dir}
              onClick={() => setSort({ dir })}
              className={`px-2.5 py-1.5 transition-colors ${sort.dir === dir
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {dir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700" />

      {/* Column filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filters (all must match)</span>
          <button
            onClick={addRule}
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            + Add filter
          </button>
        </div>

        {advanced.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No column filters — add one to narrow by any field (status, contact, time frame, …).</p>
        )}

        {advanced.map((rule, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select
              className={`${sel} w-40 shrink-0`}
              value={rule.field}
              onChange={e => updateRule(i, { field: e.target.value, value: '' })}
            >
              {SORTED_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <ValueInput rule={rule} distinct={distinct} onValue={v => updateRule(i, { value: v })} />
            <button
              onClick={() => removeRule(i)}
              className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-lg leading-none px-1"
              title="Remove filter"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {chips && onChipsChange && (
        <>
          <div className="border-t border-gray-100 dark:border-gray-700" />
          <ChipSettings chips={chips} filters={filters} onChipsChange={onChipsChange} />
        </>
      )}
    </div>
  )
}

// Which chips the bar above the list shows, and the saved ones. The three
// kinds are drawn in their own shapes, so what each shape means is learnt here.
function ChipSettings({ chips, filters, onChipsChange }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const hidden = new Set(chips.hidden)
  const toggle = key => onChipsChange({
    ...chips,
    hidden: hidden.has(key) ? chips.hidden.filter(k => k !== key) : [...chips.hidden, key],
  })
  const setCustom = custom => onChipsChange({ ...chips, custom })
  const current = { ...EMPTY_FILTERS, ...filters }
  const canSave = name.trim() && !isEmptyFilters(current)

  function save() {
    if (!canSave) return
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    setCustom([...chips.custom, { id, name: name.trim(), filters: current }])
    setName('')
  }

  const head = 'text-xs font-medium text-gray-700 dark:text-gray-300'
  const blurb = 'text-xs text-gray-400 dark:text-gray-500'

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors
          ${open
            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30'
            : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-gray-600 dark:hover:bg-gray-900/70'}`}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400" fill="currentColor" aria-hidden="true">
          <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" />
        </svg>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">Chips / saved filters</span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">Show or hide the chips above the list, and save filters as chips of your own</span>
        </span>
        <svg viewBox="0 0 16 16" className={`ml-auto w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 3l5 5-5 5" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className={head}>Round — statuses</p>
            <p className={blurb}>
              One per status. Every venue has exactly one status, so these split the list and their counts add up to all
              venues. Click to show or hide one in the bar; a status with no venues is never shown.
            </p>
            <div className="flex flex-wrap gap-2">
              {ORDERED_STATUSES.map(([key, meta]) => (
                <ToggleChip key={key} on={!hidden.has(key)} label={meta.label} onToggle={() => toggle(key)}>
                  <StatusPill status={key} />
                </ToggleChip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={head}>Square — shortcuts</p>
            <p className={blurb}>
              Lists that cut across the statuses: a venue can be in several. Incomplete details, Online form, Duplicates and
              Auto-send appear only while they have venues.
            </p>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map(s => (
                <ToggleChip key={s.key} on={!hidden.has(s.key)} label={s.label} onToggle={() => toggle(s.key)}>
                  <ShortcutChip shortcut={s.key} label={s.label} />
                </ToggleChip>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={head}>Custom — saved filters</p>
            <p className={blurb}>
              Any mix of band, country, type, search, a status or shortcut chip, the column filters and the sort above.
              Set them up, then save them as a chip. Clicking it later brings back exactly those filters.
            </p>
            {chips.custom.length > 0 && (
              <ul className="space-y-1.5">
                {chips.custom.map((c, i) => (
                  <CustomChipRow
                    key={c.id}
                    chip={c}
                    onRename={n => setCustom(chips.custom.map((x, j) => (j === i ? { ...x, name: n } : x)))}
                    onUseCurrent={isEmptyFilters(current) ? null : () => setCustom(chips.custom.map((x, j) => (j === i ? { ...x, filters: current } : x)))}
                    onRemove={() => setCustom(chips.custom.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
            )}
            <div className="flex gap-2 items-center">
              <input
                className={`${sel} flex-1 min-w-0`}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                placeholder="Name for a new chip"
              />
              <button
                type="button"
                onClick={save}
                disabled={!canSave}
                title={isEmptyFilters(current) ? 'Set some filters first' : describeFilters(current, columnLabel)}
                className="shrink-0 text-xs font-medium px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600"
              >
                Save current filters
              </button>
            </div>
            <p className={blurb}>Now: {describeFilters(current, columnLabel)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// A chip drawn as itself, switched on and off by clicking it.
function ToggleChip({ on, label, onToggle, children }) {
  return (
    <label className="relative inline-flex cursor-pointer" title={on ? `Shown — click to hide ${label}` : `Hidden — click to show ${label}`}>
      <input type="checkbox" checked={on} onChange={onToggle} className="sr-only peer" aria-label={label} />
      <span className={`pointer-events-none transition-opacity ${on ? '' : 'opacity-35 line-through'}`}>{children}</span>
      <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] leading-none flex items-center justify-center pointer-events-none
        peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400
        ${on ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
        {on ? '✓' : ''}
      </span>
    </label>
  )
}

function CustomChipRow({ chip, onRename, onUseCurrent, onRemove }) {
  const [draft, setDraft] = useState(chip.name)
  const commit = () => { const n = draft.trim(); if (n && n !== chip.name) onRename(n); else setDraft(chip.name) }
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="pointer-events-none"><CustomChip name={chip.name} /></span>
      <input
        className={`${sel} w-40 py-1 text-xs`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        aria-label="Chip name"
      />
      <span className="flex-1 min-w-[10rem] text-xs text-gray-400 dark:text-gray-500">{describeFilters(chip.filters, columnLabel)}</span>
      {onUseCurrent && (
        <button type="button" onClick={onUseCurrent} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Use current filters
        </button>
      )}
      <button type="button" onClick={onRemove} title="Delete this chip" className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-lg leading-none px-1">
        &times;
      </button>
    </li>
  )
}

function ValueInput({ rule, distinct, onValue }) {
  if (rule.field === '_status') {
    return (
      <select className={`${sel} flex-1 min-w-0`} value={rule.value} onChange={e => onValue(e.target.value)}>
        <option value="">Any status</option>
        {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    )
  }
  if (rule.field === '_health') {
    return (
      <select className={`${sel} flex-1 min-w-0`} value={rule.value} onChange={e => onValue(e.target.value)}>
        <option value="">Any reply health</option>
        {HEALTH_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    )
  }
  const col = ADVANCED_COLUMNS.find(c => c.key === rule.field)
  const opts = distinct[rule.field] || []
  const listId = `adv-${rule.field}`
  return (
    <>
      <input
        className={`${sel} flex-1 min-w-0`}
        value={rule.value}
        onChange={e => onValue(e.target.value)}
        placeholder={col?.type === 'date' ? 'contains… (e.g. 2026)' : 'contains…'}
        list={opts.length ? listId : undefined}
      />
      {opts.length > 0 && (
        <datalist id={listId}>{opts.map(o => <option key={o} value={o} />)}</datalist>
      )}
    </>
  )
}
