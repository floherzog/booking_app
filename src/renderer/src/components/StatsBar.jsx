import { useMemo } from 'react'
import { statusMeta, chipStyle, customChipStyle, useChipColors } from '../lib/palette'
import { STATUS_META, ACTION_STATUSES, ADVANCED_COLUMNS, getMissingFields, isOnlineForm, describeStatus } from '@core/constants'
import { SHORTCUTS, toggleShortcut, selectStatus, matchesFilters, filtersEqual, describeFilters, EMPTY_FILTERS } from '@core/filterRows'
import { useRules, useClassifyCtx } from '../lib/rulesContext'

// Three kinds of chip, three shapes (Filter / Chips ▸ Chips / saved filters explains them too):
// - status pills (round): one per status. Every venue has exactly one status,
//   so the pills split the list and their counts add up to all venues.
// - shortcut chips (square): lists that cut across the statuses — a venue can
//   be in several of them.
// - custom chips (square, with a bookmark): a saved set of filters.
// Clicking any chip shows only its venues; clicking it again shows all.

export const ORDERED_STATUSES = Object.entries(STATUS_META).sort((a, b) => a[1].priority - b[1].priority)

const SHORTCUT_STYLE = {
  actionOnly: {
    on: 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200',
    off: 'bg-transparent text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:text-gray-200',
  },
  nextBatch: {
    on: 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500',
    off: 'bg-transparent text-indigo-600 border-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20',
  },
  missingInfo: {
    on: 'bg-orange-500 text-white border-orange-500 dark:bg-orange-500 dark:border-orange-500',
    off: 'bg-transparent text-orange-600 border-orange-300 hover:border-orange-400 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:border-orange-600 dark:hover:bg-orange-900/20',
  },
  duplicate: {
    on: 'bg-rose-500 text-white border-rose-500 dark:bg-rose-500 dark:border-rose-500',
    off: 'bg-transparent text-rose-600 border-rose-300 hover:border-rose-400 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:border-rose-600 dark:hover:bg-rose-900/20',
  },
  onlineForm: {
    on: 'bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500 dark:border-cyan-500',
    off: 'bg-transparent text-cyan-700 border-cyan-300 hover:border-cyan-400 hover:bg-cyan-50 dark:text-cyan-400 dark:border-cyan-800 dark:hover:border-cyan-600 dark:hover:bg-cyan-900/20',
  },
  autoSend: {
    on: 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500',
    off: 'bg-transparent text-teal-600 border-teal-300 hover:border-teal-400 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:hover:border-teal-600 dark:hover:bg-teal-900/20',
  },
}
const SHORTCUT_TITLES = {
  missingInfo: 'Venues with something missing — everything behind the “Missing info” status, plus a missing contact or location, which don’t stop an email.',
  onlineForm: 'Venues that only take enquiries through a form on their website. They keep their status but are never drafted.',
}
// Shown even with nothing in them; the others only once they have a venue.
const ALWAYS_SHOWN = new Set(['actionOnly', 'nextBatch'])

const BookmarkIcon = (
  <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" />
  </svg>
)

export function StatusPill({ status, count, active, onClick, title }) {
  useChipColors()
  const meta = statusMeta(status)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all
        ${meta.badge}
        ${active ? 'ring-2 ring-offset-1 ring-current dark:ring-offset-gray-900' : 'hover:opacity-80'}`}
    >
      <span>{meta.label}</span>
      {count !== undefined && <span className="font-bold">{count}</span>}
    </button>
  )
}

export function ShortcutChip({ shortcut, label, count, active, onClick, title }) {
  useChipColors()
  const style = chipStyle(shortcut, SHORTCUT_STYLE[shortcut])
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${active ? style.on : style.off}`}
    >
      {label}
      {count !== undefined && <span className="font-bold text-xs">{count}</span>}
    </button>
  )
}

const CUSTOM_STYLE = {
  on: 'bg-slate-700 text-white border-slate-700 dark:bg-slate-300 dark:text-slate-900 dark:border-slate-300',
  off: 'bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500',
}

export function CustomChip({ name, color, count, active, onClick, title }) {
  const style = customChipStyle(color, CUSTOM_STYLE)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${active ? style.on : style.off}`}
    >
      {BookmarkIcon}
      {name}
      {count !== undefined && <span className="font-bold text-xs">{count}</span>}
    </button>
  )
}

export const columnLabel = key => ADVANCED_COLUMNS.find(c => c.key === key)?.label || key

// `strip`: one row that scrolls sideways, for the pinned bar at the top.
export default function StatsBar({ rows, filters, onChange, duplicateCount, isDuplicate, chips, batchWhyEmpty, strip = false }) {
  useChipColors()
  const rules = useRules()
  const classify = useClassifyCtx()
  const hidden = useMemo(() => new Set(chips?.hidden || []), [chips])
  const custom = chips?.custom || []

  const counts = useMemo(() => {
    const byStatus = {}
    rows.forEach(r => { byStatus[r._status] = (byStatus[r._status] || 0) + 1 })
    return {
      byStatus,
      actionOnly: rows.filter(r => ACTION_STATUSES.has(r._status)).length,
      // Next batch folds in manually flagged "Draft" venues (see row dots).
      nextBatch: rows.filter(r => r._nextBatch || r['Draft'] === 'TRUE').length,
      missingInfo: rows.filter(r => getMissingFields(r, classify).length > 0).length,
      onlineForm: rows.filter(isOnlineForm).length,
      duplicate: duplicateCount,
      autoSend: rows.filter(r => r['Auto'] === 'TRUE').length,
    }
  }, [rows, duplicateCount, classify])

  const customCounts = useMemo(
    () => custom.map(c => rows.filter(r => matchesFilters(r, c.filters, { isDuplicate, classify })).length),
    [custom, rows, isDuplicate, classify],
  )

  const activeStatus = filters.status
  const activeMeta = activeStatus ? statusMeta(activeStatus) : null
  const shortcuts = SHORTCUTS.filter(s => !hidden.has(s.key) && (ALWAYS_SHOWN.has(s.key) || counts[s.key] > 0 || filters[s.key]))

  return (
    <div className="space-y-2">
      <div className={`flex gap-2 items-center ${strip ? 'flex-nowrap overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0 py-0.5' : 'flex-wrap'}`}>
        {ORDERED_STATUSES.map(([key]) => {
          const count = counts.byStatus[key] || 0
          const active = activeStatus === key
          if (!active && (count === 0 || hidden.has(key))) return null
          return (
            <StatusPill
              key={key} status={key} count={count} active={active}
              onClick={() => onChange(f => selectStatus(f, active ? '' : key))}
            />
          )
        })}

        {shortcuts.length > 0 && <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />}

        {shortcuts.map(s => (
          <ShortcutChip
            key={s.key} shortcut={s.key} label={s.label} count={counts[s.key]} active={!!filters[s.key]}
            title={s.key === 'nextBatch' && !counts.nextBatch && batchWhyEmpty ? batchWhyEmpty : SHORTCUT_TITLES[s.key]}
            onClick={() => onChange(f => toggleShortcut(f, s.key))}
          />
        ))}

        {custom.length > 0 && <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 self-center" />}

        {custom.map((c, i) => {
          const active = filtersEqual(filters, c.filters)
          return (
            <CustomChip
              key={c.id} name={c.name} color={c.color} count={customCounts[i]} active={active}
              title={describeFilters(c.filters, columnLabel)}
              onClick={() => onChange(active ? EMPTY_FILTERS : { ...EMPTY_FILTERS, ...c.filters })}
            />
          )
        })}
      </div>

      {activeMeta && !strip && (
        <p className={`text-xs px-3 py-1.5 rounded-md inline-block ${activeMeta.badge} bg-opacity-60`}>
          <span className="font-medium">{activeMeta.label}:</span> {describeStatus(activeStatus, rules)}
        </p>
      )}
    </div>
  )
}
