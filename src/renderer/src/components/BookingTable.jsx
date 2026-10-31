import { statusMeta, useChipColors } from '../lib/palette'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useIsDesktop } from '../lib/useMediaQuery'
import StatusBadge from './StatusBadge'
import EditableCell from './EditableCell'
import SelectCell from './SelectCell'
import RelDate from './RelDate'
import { lastEmailedColor, followUpColor, lastPlayedColor, lastReplyColor } from '@core/dateColors'
import { ADVANCED_COLUMNS, STATUS_META, HEALTH_RANK, getMissingFields, getMissingSeverity, describeMissing } from '@core/constants'
import { parseDate, displayDateText, normalizeDateText } from '@core/parseDate'
import DateInput from './DateInput'
import { parseReplyStatus, composeReplyStatus, replyHealth } from '@core/replyStatus'
import { healthMeta, HEALTH_META } from '../lib/health'
import { prepareDraft } from '../lib/drafts'
import { useClassifyCtx } from '../lib/rulesContext'
import { useDragSelect } from '../lib/useDragSelect'
import { usePinToolbar, usePinItems } from '../lib/uiPrefs'
import { MailIcon } from './icons'
import { isSharedField } from '@core/multiBand'


// The Reply Status kind reads as a recorded fact (a tinted badge with an inbound
// icon), deliberately unlike the additive +pills of the Outreach action column.
// Same palette as the row tint (see lib/health.js) so the badge and the colour of
// the row it sits in never tell different stories.
const REPLY_BADGE = {
  reply: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  'auto-reply': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  none: 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500',
}
const REPLY_LABEL = { reply: 'replied', 'auto-reply': 'auto-reply', none: 'no reply' }
const REPLY_ICON = { reply: '↩', 'auto-reply': '⟳', none: '' }
function rowHighlight(row) {
  return healthMeta(row).row
}

const helper = createColumnHelper()

const SEVERITY_BADGE = {
  3: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  2: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  1: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
}

function mkEditable(field, opts = {}) {
  return helper.accessor(field, {
    ...opts,
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      return (
        <EditableCell
          value={i.row.original[field] || ''}
          rowIndex={i.row.original._idx}
          field={field}
          edits={edits}
          onEdit={onEdit}
          isDate={opts.isDate || false}
          className={opts.cellClass || 'text-sm text-gray-700'}
        />
      )
    },
  })
}

// --- Several bands per venue (multi-band mode) ---------------------------------
// The table shows one row per venue. Its data is a group: the venue's first
// entry, plus `_entries` — every band entry of the venue that passed the
// filters. Venue-wide columns render once; the per-band ones below render one
// fixed-height line per entry, so the lines of one band sit level across the
// columns. A venue with a single band renders exactly as before.
const PER_BAND = new Set(['_status', 'Band', 'Last emailed', 'Follow Up Date', 'Note', 'Status', 'flags'])

// The cell context TanStack would have built if the entry were the row.
function entryContext(i, entry, accessorKey) {
  return {
    ...i,
    row: { ...i.row, original: entry },
    getValue: () => (accessorKey ? entry[accessorKey] : undefined),
    // Cells that are tall on their own (Outreach) lay out flatter when stacked.
    stacked: true,
  }
}

// The entry a group sorts by: the one that would sort first — the most urgent
// status, the earliest date.
function sortEntry(row, fn, colId) {
  const entries = row.original._entries || [row.original]
  return entries
    .map(original => ({ ...row, original }))
    .reduce((best, x) => (fn(x, best, colId) < 0 ? x : best))
}

function perBand(col) {
  const { cell, sortingFn, accessorKey } = col
  return {
    ...col,
    cell: i => {
      const entries = i.row.original._entries || [i.row.original]
      if (entries.length < 2) return flexRender(cell, i)
      return (
        <div className="-my-2 divide-y divide-gray-100 dark:divide-gray-800">
          {entries.map(e => (
            // data-entry: a click on this line opens this band, not the first.
            <div key={e._idx} data-entry={e._idx} className="h-[5rem] py-2 overflow-hidden">
              {flexRender(cell, entryContext(i, e, accessorKey))}
            </div>
          ))}
        </div>
      )
    },
    sortingFn: typeof sortingFn === 'function'
      ? (a, b, colId) => sortingFn(sortEntry(a, sortingFn, colId), sortEntry(b, sortingFn, colId), colId)
      : sortingFn,
  }
}

// The height of one band's line in a stacked row: h-[5rem] below.
const BAND_LINE_PX = 80

const withPerBand = col => (PER_BAND.has(col.id ?? col.accessorKey) ? perBand(col) : col)

// Rows (entries) → groups, one per venue, entries ordered most urgent first.
function groupEntries(rows) {
  const byVenue = new Map()
  for (const r of rows) {
    const key = r._venueId ?? `i${r._idx}`
    const list = byVenue.get(key)
    if (list) list.push(r)
    else byVenue.set(key, [r])
  }
  const prio = r => STATUS_META[r._status]?.priority ?? 9
  return [...byVenue.values()].map(entries => {
    const sorted = entries.length > 1
      ? [...entries].sort((a, b) => prio(a) - prio(b) || (a['Band'] || '').localeCompare(b['Band'] || ''))
      : entries
    return { ...sorted[0], _entries: sorted }
  })
}

const COLUMNS = [
  helper.accessor('_missingSeverity', {
    id: '_missingSeverity',
    header: '',
    cell: () => null,
    enableSorting: true,
  }),
  helper.accessor('_status', {
    // Every badge, invisible and zero-height: the column widths are frozen from
    // the rows drawn first (see colWidths below), and when those all said
    // "Send", a "Not for this band" further down spilled into the Venue column.
    header: () => (
      <>
        <div aria-hidden className="h-0 overflow-hidden invisible normal-case tracking-normal">
          {Object.keys(STATUS_META).map(s => <div key={s}><StatusBadge status={s} /></div>)}
        </div>
        Status
      </>
    ),
    cell: i => <StatusBadge status={i.getValue()} />,
    sortingFn: (a, b) =>
      (STATUS_META[a.original._status]?.priority ?? 9) -
      (STATUS_META[b.original._status]?.priority ?? 9),
    size: 140,
    enableSorting: true,
  }),
  helper.accessor('Venue', {
    header: 'Venue',
    cell: i => {
      const { edits, classify } = i.table.options.meta
      const row = i.row.original
      const rowEdits = edits[row._idx] || {}
      const effective = { ...row, ...rowEdits }
      const missing = getMissingFields(effective, classify)
      const website = effective['Website']
      const nameEl = website ? (
        <a
          href={website} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
        >
          {effective['Venue'] || '—'}
        </a>
      ) : (
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {effective['Venue'] || '—'}
        </span>
      )
      const draftNext = effective['Draft'] === 'TRUE'
      return (
        <div className="flex items-center gap-1.5">
          {draftNext
            ? <span title="Flagged: draft next" className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600" />
            : row._nextBatch && (
              (effective['Note'] || '').trim()
                ? <span title="In next batch, but needs an LLM note check — may be skipped" className="shrink-0 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-amber-300 dark:ring-amber-600" />
                : <span title="In next OpenClaw batch" className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          {nameEl}
          {missing.length > 0 && (
            <span
              title={missingTitle(missing)}
              className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${SEVERITY_BADGE[row._missingSeverity] || SEVERITY_BADGE[1]}`}
            >
              !
            </span>
          )}
        </div>
      )
    },
    sortingFn: 'alphanumeric',
  }),
  mkEditable('City', { header: 'City', cellClass: 'text-sm text-gray-600' }),
  mkEditable('Country', { header: 'Country', cellClass: 'text-sm text-gray-600' }),
  helper.accessor('Band', {
    header: 'Band',
    cell: i => {
      const { edits, onEdit, bandOptions } = i.table.options.meta
      return (
        <SelectCell
          value={i.row.original['Band'] || ''}
          rowIndex={i.row.original._idx}
          field="Band"
          edits={edits}
          onEdit={onEdit}
          options={bandOptions || []}
          className="text-sm text-gray-700 dark:text-gray-300"
        />
      )
    },
    sortingFn: 'alphanumeric',
  }),
  helper.accessor('Type', {
    header: 'Type',
    cell: i => {
      const { edits, onEdit, typeOptions, onAddType } = i.table.options.meta
      return (
        <SelectCell
          value={i.row.original['Type'] || ''}
          rowIndex={i.row.original._idx}
          field="Type"
          label="Type"
          title="Click to change the venue type"
          edits={edits}
          onEdit={onEdit}
          options={typeOptions || []}
          onAddOption={onAddType}
          className="text-xs text-gray-500 dark:text-gray-400"
        />
      )
    },
    sortingFn: 'alphanumeric',
  }),
  helper.accessor('Last emailed', {
    header: 'Last Emailed',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const raw = edits[i.row.original._idx]?.['Last emailed'] ?? i.row.original['Last emailed'] ?? ''
      return (
        <div className="space-y-0.5">
          <EditableCell value={i.row.original['Last emailed'] || ''} rowIndex={i.row.original._idx} field="Last emailed" edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
          <RelDate raw={raw} colorFn={lastEmailedColor} row={i.row.original} />
        </div>
      )
    },
    sortingFn: (a, b) => {
      const da = parseDate(a.original['Last emailed'])
      const db = parseDate(b.original['Last emailed'])
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  helper.accessor('Follow Up Date', {
    header: 'Follow Up',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const raw = edits[i.row.original._idx]?.['Follow Up Date'] ?? i.row.original['Follow Up Date'] ?? ''
      return (
        <div className="space-y-0.5">
          <EditableCell value={i.row.original['Follow Up Date'] || ''} rowIndex={i.row.original._idx} field="Follow Up Date" edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
          <RelDate raw={raw} colorFn={followUpColor} row={i.row.original} />
        </div>
      )
    },
    sortingFn: (a, b) => {
      const da = parseDate(a.original['Follow Up Date'])
      const db = parseDate(b.original['Follow Up Date'])
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  mkEditable('Note', { header: 'Note', cellClass: 'text-xs text-gray-500' }),
  helper.accessor('Status', {
    header: 'Reply Status',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      return <ReplyStatusCell rowIndex={i.row.original._idx} value={i.row.original['Status'] || ''} edits={edits} onEdit={onEdit} />
    },
    sortingFn: (a, b) => {
      const da = parseReplyStatus(a.original['Status']).date
      const db = parseReplyStatus(b.original['Status']).date
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
      return da - db
    },
  }),
  helper.display({
    id: 'flags',
    header: 'Outreach',
    cell: i => {
      const { edits, onEdit } = i.table.options.meta
      const row = i.row.original
      const draft = (edits[row._idx]?.['Draft'] ?? row['Draft'] ?? '') === 'TRUE'
      const auto = (edits[row._idx]?.['Auto'] ?? row['Auto'] ?? '') === 'TRUE'
      return (
        <div className={i.stacked ? 'flex flex-wrap gap-1 items-start' : 'flex flex-col gap-1 items-start'}>
          <DraftAction row={{ ...row, ...(edits[row._idx] || {}) }} meta={i.table.options.meta} />
          <FlagPill
            label="Next batch" active={draft}
            activeClass="bg-emerald-500 text-white border-emerald-500"
            onToggle={() => onEdit(row._idx, 'Draft', draft ? '' : 'TRUE')}
          />
          <FlagPill
            label="Auto-send" active={auto}
            activeClass="bg-teal-500 text-white border-teal-500"
            onToggle={() => onEdit(row._idx, 'Auto', auto ? '' : 'TRUE')}
          />
        </div>
      )
    },
  }),
].map(withPerBand)

// Checkbox column injected at the front only in bulk-select mode. The header
// checkbox selects/clears every currently-shown (filtered) row.
// One-click draft straight from the row. Disabled (with the reason on hover)
// when the venue has no email or no template for its band and language.
function DraftAction({ row, meta }) {
  const { templates, languages, settings, onQuickDraft, draftingIdx, draftResults } = meta
  if (!onQuickDraft) return null

  const prepared = prepareDraft(row, templates || [], languages, settings)
  const busy = draftingIdx === row._idx
  const result = draftResults?.[row._idx]

  return (
    <button
      onClick={e => { e.stopPropagation(); onQuickDraft(row) }}
      disabled={!prepared.ok || busy}
      title={prepared.ok ? `Create a draft in Mail (${prepared.language})` : prepared.reason}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[11px] leading-none transition-colors disabled:opacity-30 ${
        result?.ok
          ? 'border-green-400 text-green-600 dark:text-green-400'
          : result
            ? 'border-red-400 text-red-600 dark:text-red-400'
            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
      }`}
    >
      {busy ? '…' : <><MailIcon className="w-3.5 h-3.5" />{result?.ok ? ' ✓' : result ? ' ✗' : ''}</>}
    </button>
  )
}

const SELECT_COLUMN = helper.display({
  id: '_select',
  size: 32,
  header: ctx => {
    const { selected, onToggleAll } = ctx.table.options.meta
    const ids = ctx.table.getRowModel().rows.flatMap(r => (r.original._entries || [r.original]).map(e => e._idx))
    const allSelected = ids.length > 0 && ids.every(i => selected?.has(i))
    return (
      <input
        type="checkbox"
        aria-label="Select all shown venues"
        checked={allSelected}
        onChange={e => onToggleAll(ids, e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
      />
    )
  },
  cell: i => {
    const { selected, onToggleAll } = i.table.options.meta
    // A venue is selected with all of its shown bands; a bulk edit then applies
    // to each of them.
    const ids = (i.row.original._entries || [i.row.original]).map(e => e._idx)
    const checked = ids.every(id => selected?.has(id))
    return (
      <input
        type="checkbox"
        aria-label="Select venue"
        checked={checked}
        onChange={() => onToggleAll(ids, !checked)}
        onClick={e => e.stopPropagation()}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 cursor-pointer"
      />
    )
  },
})

// Fields that already have a dedicated column — no need to inject these.
const DISPLAYED_FIELDS = new Set(
  ['_status', 'Venue', 'City', 'Country', 'Band', 'Type', 'Last emailed', 'Follow Up Date', 'Note', 'Status']
)

const dateSortingFn = field => (a, b) => {
  const da = parseDate(a.original[field])
  const db = parseDate(b.original[field])
  if (!da && !db) return 0; if (!da) return 1; if (!db) return -1
  return da - db
}

// An editable column for a field that isn't shown by default, so the column the
// user sorts by in the advanced panel becomes visible in the table.
function buildExtraColumn(field) {
  const col = buildExtraColumnDef(field)
  return col && !isSharedField(field) ? perBand(col) : col
}

function buildExtraColumnDef(field) {
  const col = ADVANCED_COLUMNS.find(c => c.key === field)
  if (!col) return null
  if (col.type === 'date') {
    const colorFn = field === 'Last played' ? lastPlayedColor : followUpColor
    return helper.accessor(field, {
      header: col.label,
      cell: i => {
        const { edits, onEdit } = i.table.options.meta
        const raw = edits[i.row.original._idx]?.[field] ?? i.row.original[field] ?? ''
        return (
          <div className="space-y-0.5">
            <EditableCell value={i.row.original[field] || ''} rowIndex={i.row.original._idx} field={field} edits={edits} onEdit={onEdit} isDate className="text-xs text-gray-500" />
            <RelDate raw={raw} colorFn={colorFn} row={i.row.original} />
          </div>
        )
      },
      sortingFn: dateSortingFn(field),
    })
  }
  if (col.type === 'number') {
    return helper.accessor(field, {
      header: col.label,
      cell: i => <span className="text-sm text-gray-600 tabular-nums">{i.row.original[field] || '0'}</span>,
      sortingFn: (a, b) => (Number(a.original[field]) || 0) - (Number(b.original[field]) || 0),
    })
  }
  if (col.type === 'health') {
    return helper.accessor(() => '', {
      id: '_health',
      header: col.label,
      cell: i => {
        const h = replyHealth(i.row.original)
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className={`w-2.5 h-2.5 rounded-full ${(HEALTH_META[h] || HEALTH_META.none).dot}`} />
            {h}
          </span>
        )
      },
      sortingFn: (a, b) => (HEALTH_RANK[replyHealth(a.original)] ?? 9) - (HEALTH_RANK[replyHealth(b.original)] ?? 9),
    })
  }
  return mkEditable(field, { header: col.label, cellClass: 'text-sm text-gray-600' })
}

// Last-reply editor: the reply date (typed or picked) with its countdown on top, the
// reply kind (dropdown) underneath. Both recompose the single `Status` CSV field.
function ReplyStatusCell({ rowIndex, value, edits, onEdit }) {
  const raw = edits[rowIndex]?.['Status'] ?? value ?? ''
  const { kind, dateStr } = parseReplyStatus(raw)
  const isEdited = edits[rowIndex]?.['Status'] !== undefined
  const [editingDate, setEditingDate] = useState(false)
  const [editingKind, setEditingKind] = useState(false)
  const kindRef = useRef(null)
  useEffect(() => { if (editingKind && kindRef.current) kindRef.current.focus() }, [editingKind])

  function commitDate(text) {
    setEditingDate(false)
    if (text === normalizeDateText(dateStr)) return
    // Setting a date on an uncategorised row implies a real reply.
    const nextKind = kind === 'none' && text ? 'reply' : kind
    onEdit(rowIndex, 'Status', composeReplyStatus(nextKind, text))
  }
  function commitKind(e) {
    setEditingKind(false)
    onEdit(rowIndex, 'Status', composeReplyStatus(e.target.value, dateStr))
  }

  const colorFn = kind === 'auto-reply' ? () => 'text-gray-400' : lastReplyColor
  return (
    <div className={`space-y-1 min-w-[8rem] rounded px-1 -mx-1 ${isEdited ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : ''}`}>
      {editingDate ? (
        <DateInput
          value={dateStr}
          autoFocus
          onCommit={commitDate}
          onCancel={() => setEditingDate(false)}
          className="w-24 rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      ) : (
        <div
          onClick={e => { e.stopPropagation(); setEditingDate(true) }}
          className="cursor-text hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 -mx-1"
          title="Click to set the reply date"
        >
          {dateStr ? (
            <div className="leading-tight">
              <span className="text-xs text-gray-600 dark:text-gray-300">{displayDateText(dateStr)}</span>
              <div><RelDate raw={dateStr} colorFn={colorFn} /></div>
            </div>
          ) : (
            <span className="text-gray-300 dark:text-gray-600 text-xs">— set date —</span>
          )}
        </div>
      )}
      {editingKind ? (
        <select
          ref={kindRef}
          value={kind}
          onChange={commitKind}
          onBlur={() => setEditingKind(false)}
          onClick={e => e.stopPropagation()}
          className="rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="none">— no reply —</option>
          <option value="reply">replied</option>
          <option value="auto-reply">auto-reply</option>
        </select>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setEditingKind(true) }}
          title="Click to change the reply type"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors hover:opacity-80 ${REPLY_BADGE[kind]}`}
        >
          {REPLY_ICON[kind] && <span className="leading-none">{REPLY_ICON[kind]}</span>}
          {REPLY_LABEL[kind]}
        </button>
      )}
    </div>
  )
}

function FlagPill({ label, active, activeClass, onToggle }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-colors
        ${active ? activeClass : 'bg-transparent text-gray-400 border-gray-200 dark:border-gray-700 dark:text-gray-500'}`}
    >
      <span className="leading-none">{active ? '✓' : '+'}</span>{label}
    </button>
  )
}

// One band's part of a mobile card in multi-band mode: its status, band, dates
// and flags on a couple of lines. Tapping it opens that band.
function MobileEntry({ entry, edits, onEdit }) {
  const e = { ...entry, ...(edits[entry._idx] || {}) }
  const draftNext = e['Draft'] === 'TRUE'
  const autoSend = e['Auto'] === 'TRUE'
  return (
    <div data-entry={entry._idx} className="py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{e['Band'] || <span className="italic text-gray-400">no band</span>}</span>
        <StatusBadge status={entry._status} />
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {e['Last emailed'] && <span className="text-xs text-gray-400">Emailed <RelDate raw={e['Last emailed']} colorFn={lastEmailedColor} row={e} /></span>}
        {e['Follow Up Date'] && <span className="text-xs text-gray-400">Follow up <RelDate raw={e['Follow Up Date']} colorFn={followUpColor} row={e} /></span>}
      </div>
      <div className="mt-1 flex gap-1.5">
        <FlagPill label="Next batch" active={draftNext} activeClass="bg-emerald-500 text-white border-emerald-500"
          onToggle={() => onEdit(entry._idx, 'Draft', draftNext ? '' : 'TRUE')} />
        <FlagPill label="Auto-send" active={autoSend} activeClass="bg-teal-500 text-white border-teal-500"
          onToggle={() => onEdit(entry._idx, 'Auto', autoSend ? '' : 'TRUE')} />
      </div>
    </div>
  )
}

// Selecting on a phone. In Select mode a tap toggles the card (nothing inside
// it reacts) and a checkbox shows which are picked; outside it, pressing and
// holding a card starts Select mode with that card picked. There is no drag
// selection here: on a touch screen a drag scrolls.
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP = 10 // px the finger may wander before it counts as scrolling
function MobileSelectable({ row, selectMode, selected, onSetSelected, onStartSelect, children }) {
  const press = useRef(null)
  const ids = (row.original._entries || [row.original]).map(e => e._idx)
  const isSelected = selectMode && ids.every(id => selected?.has(id))

  function cancelPress() {
    if (press.current) {
      clearTimeout(press.current.timer)
      window.removeEventListener('scroll', press.current.onScroll)
    }
    press.current = null
  }
  function fire() {
    const p = press.current
    if (!p || p.fired) return
    clearTimeout(p.timer)
    window.removeEventListener('scroll', p.onScroll)
    p.fired = true
    navigator.vibrate?.(10)
    onStartSelect(ids)
  }
  function onPointerDown(e) {
    // A long press the browser ended without a click leaves its state behind;
    // a new touch starts afresh, so the first tap in Select mode counts.
    cancelPress()
    if (selectMode || !onStartSelect || e.pointerType === 'mouse') return
    // A press that turns into scrolling is no long press.
    const onScroll = () => { if (!press.current?.fired) cancelPress() }
    window.addEventListener('scroll', onScroll, { passive: true })
    press.current = { x: e.clientX, y: e.clientY, fired: false, onScroll, timer: setTimeout(fire, LONG_PRESS_MS) }
  }
  function onPointerMove(e) {
    const p = press.current
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress()
  }
  function toggle() {
    const next = new Set(selected)
    for (const id of ids) {
      if (isSelected) next.delete(id)
      else next.add(id)
    }
    onSetSelected(next)
  }

  return (
    <div
      // The tint is laid over the card, whose own status colours would hide a background.
      className={`relative flex items-stretch select-none [-webkit-touch-callout:none] ${isSelected ? 'after:absolute after:inset-0 after:bg-indigo-500/15 after:pointer-events-none' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => { if (!press.current?.fired) cancelPress() }}
      // The browser's own long-press gesture cancels the pointer (and may ask
      // for a context menu) at about the moment ours fires; that is the long
      // press, not a reason to drop it. Scrolling already cancelled above.
      onContextMenu={e => {
        if (!press.current) return
        e.preventDefault()
        fire()
      }}
      onClickCapture={e => {
        // The click that ends a long press only started Select mode.
        if (press.current?.fired) {
          e.preventDefault(); e.stopPropagation(); cancelPress()
          return
        }
        if (!selectMode) return
        e.preventDefault(); e.stopPropagation()
        toggle()
      }}
    >
      {selectMode && (
        <span className="flex items-center pl-3 shrink-0" aria-hidden="true">
          <span className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
            {isSelected && (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 8.2l2.5 2.5 5.5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </span>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function MobileCard({ row, edits, onVenueClick, onEdit }) {
  useChipColors()
  const classify = useClassifyCtx()
  const r = row.original
  const entries = r._entries || [r]
  if (entries.length > 1) {
    const effective = { ...r, ...(edits[r._idx] || {}) }
    const missing = getMissingFields(effective, classify)
    return (
      <div
        onClick={e => {
          if (e.target.closest('button, a, input')) return
          const line = e.target.closest('[data-entry]')
          onVenueClick(line ? Number(line.dataset.entry) : r._idx)
        }}
        className={`w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 active:bg-gray-100 dark:active:bg-gray-800 transition-colors cursor-pointer ${entries.some(x => edits[x._idx]) ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{effective['Venue'] || '—'}</span>
          {missing.length > 0 && (
            <span title={missingTitle(missing)} className={`w-4 h-4 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${SEVERITY_BADGE[getMissingSeverity(effective, classify)] || SEVERITY_BADGE[1]}`}>!</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400">
          {(effective['City'] || effective['Country']) && <span>{[effective['City'], effective['Country']].filter(Boolean).join(', ')}</span>}
          {effective['Type'] && <span className="text-gray-400">{effective['Type']}</span>}
        </div>
        <div className="mt-1">
          {entries.map(x => <MobileEntry key={x._idx} entry={x} edits={edits} onEdit={onEdit} />)}
        </div>
      </div>
    )
  }

  const rowEdits = edits[r._idx] || {}
  const effective = { ...r, ...rowEdits }
  const missing = getMissingFields(effective, classify)
  const hasEdits = !!edits[r._idx]
  const meta = statusMeta(r._status)
  const highlight = hasEdits ? '' : rowHighlight(r)
  const draftNext = effective['Draft'] === 'TRUE'
  const autoSend = effective['Auto'] === 'TRUE'

  const lastEmailedRaw = rowEdits['Last emailed'] ?? r['Last emailed'] ?? ''
  const followUpRaw    = rowEdits['Follow Up Date'] ?? r['Follow Up Date'] ?? ''

  return (
    <div
      onClick={e => { if (e.target.closest('button, a, input')) return; onVenueClick(r._idx) }}
      className={`w-full text-left px-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 active:bg-gray-100 dark:active:bg-gray-800 transition-colors cursor-pointer ${meta.row || ''} ${highlight} ${hasEdits ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {draftNext
            ? <span title="Flagged: draft next" className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600" />
            : r._nextBatch && (
              (effective['Note'] || '').trim()
                ? <span title="In next batch, but needs an LLM note check — may be skipped" className="shrink-0 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-amber-300 dark:ring-amber-600" />
                : <span title="In next OpenClaw batch" className="shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{effective['Venue'] || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {missing.length > 0 && (
            <span title={missingTitle(missing)} className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${SEVERITY_BADGE[getMissingSeverity(effective, classify)] || SEVERITY_BADGE[1]}`}>!</span>
          )}
          <StatusBadge status={r._status} />
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
        {effective['Band'] && <span className="font-medium text-gray-700 dark:text-gray-300">{effective['Band']}</span>}
        {(effective['City'] || effective['Country']) && (
          <span>{[effective['City'], effective['Country']].filter(Boolean).join(', ')}</span>
        )}
        {effective['Type'] && <span className="text-gray-400">{effective['Type']}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {lastEmailedRaw && (
          <span className="text-xs text-gray-400">
            Emailed <RelDate raw={lastEmailedRaw} colorFn={lastEmailedColor} row={effective} />
          </span>
        )}
        {followUpRaw && (
          <span className="text-xs text-gray-400">
            Follow up <RelDate raw={followUpRaw} colorFn={followUpColor} row={effective} />
          </span>
        )}
      </div>
      {effective['Note'] && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate">{effective['Note']}</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <FlagPill
          label="Next batch" active={draftNext}
          activeClass="bg-emerald-500 text-white border-emerald-500"
          onToggle={() => onEdit(r._idx, 'Draft', draftNext ? '' : 'TRUE')}
        />
        <FlagPill
          label="Auto-send" active={autoSend}
          activeClass="bg-teal-500 text-white border-teal-500"
          onToggle={() => onEdit(r._idx, 'Auto', autoSend ? '' : 'TRUE')}
        />
      </div>
    </div>
  )
}

const missingTitle = missing => `Missing: ${describeMissing(missing)}`

export default function BookingTable({ rows, emptyNote, edits, onEdit, onVenueClick, sortBy, extraField, bandOptions, typeOptions, onAddType, selectMode = false, selected, onSetSelected, onStartSelect, onToggleAll, templates, languages, settings, onQuickDraft, draftingIdx, draftResults }) {
  useChipColors() // rows redraw in a newly chosen colour
  const [sorting, setSorting] = useState(sortBy || [{ id: '_status', desc: false }])

  useEffect(() => {
    if (sortBy) setSorting(sortBy)
  }, [JSON.stringify(sortBy)]) // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(() => {
    let cols = COLUMNS
    if (extraField && !DISPLAYED_FIELDS.has(extraField)) {
      const extra = buildExtraColumn(extraField)
      if (extra) cols = [...COLUMNS.slice(0, -1), extra, COLUMNS[COLUMNS.length - 1]]
    }
    if (selectMode) cols = [SELECT_COLUMN, ...cols]
    return cols
  }, [extraField, selectMode])

  // TanStack Table returns functions the React Compiler can't memoize; that's
  // expected here and safe, so silence the compatibility hint.
  // eslint-disable-next-line react-hooks/incompatible-library
  const groups = useMemo(() => groupEntries(rows), [rows])
  const classify = useClassifyCtx()
  const table = useReactTable({
    data: groups,
    columns,
    state: { sorting, columnVisibility: { _missingSeverity: false } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: { edits, classify, onEdit, onVenueClick, bandOptions, typeOptions, onAddType, selected, onToggleAll, templates, languages, settings, onQuickDraft, draftingIdx, draftResults },
  })

  const sortedRows = table.getRowModel().rows

  // Select mode: the whole row selects (click, shift-click, drag) instead of
  // opening the venue or editing a cell.
  const selectPointerDown = useDragSelect({
    enabled: selectMode,
    count: sortedRows.length,
    idsAt: i => (sortedRows[i]?.original._entries || [sortedRows[i]?.original]).filter(Boolean).map(e => e._idx),
    selected: selected || new Set(),
    setSelected: onSetSelected,
  })

  // Only one of the two layouts is ever visible, so only one is mounted. Both are
  // windowed against the page scroller (the app has no inner scroll container, and
  // giving it one would change how the whole view scrolls).
  const isDesktop = useIsDesktop()
  const listRef = useRef(null)
  // Rows start partway down the document; without this offset the window scroll
  // position and the virtual offsets disagree by exactly that much. It has to be
  // state, not a ref: on the first render the node does not exist yet, and
  // nothing else would re-render to pick up the real value.
  const [scrollMargin, setScrollMargin] = useState(0)
  const [listWidth, setListWidth] = useState(0)
  useLayoutEffect(() => {
    const update = () => {
      setScrollMargin(listRef.current?.offsetTop ?? 0)
      setListWidth(listRef.current?.clientWidth ?? 0)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isDesktop])

  // Column widths are measured once and then frozen (table-layout: fixed). Left
  // to the browser, they follow whichever rows happen to be drawn: a long venue
  // name scrolling into the window widened its column, narrowed the others, made
  // every row wrap a line taller — and taller rows meant fewer drawn, the long
  // name dropped out again, and the list flipped between the two layouts every
  // frame. Measured again only when the columns or the window width change.
  const tableRef = useRef(null)

  // Column headings that stay under the pinned toolbar (Settings ▸ General).
  // position: sticky only works while no box between the table and the window
  // scrolls, so when the table fits the window the wrapper clips instead of
  // scrolling sideways and the headings simply stick. When it is wider than the
  // window the wrapper has to scroll, and the headings are moved down by hand
  // as the page scrolls instead.
  const pinItems = usePinItems()
  const pinHead = usePinToolbar() && pinItems.headings && isDesktop
  const theadRef = useRef(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const wrap = listRef.current
    const tbl = tableRef.current
    if (!isDesktop || !wrap || !tbl) return
    const check = () => setFits(tbl.scrollWidth <= wrap.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(wrap)
    ro.observe(tbl)
    return () => ro.disconnect()
  }, [isDesktop])
  useEffect(() => {
    const head = theadRef.current
    if (!pinHead || fits || !head) return
    let frame = 0
    const cells = () => head.querySelectorAll('th')
    const place = () => {
      frame = 0
      const pinTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pin-top')) || 0
      const r = head.getBoundingClientRect() // its own place: moving the cells doesn't move it
      const room = (tableRef.current?.getBoundingClientRect().bottom ?? r.bottom) - r.bottom
      const shift = Math.max(0, Math.min(pinTop - r.top, room))
      cells().forEach(th => { th.style.transform = shift ? `translateY(${shift}px)` : '' })
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(place) }
    place()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cells().forEach(th => { th.style.transform = '' })
    }
  }, [pinHead, fits])

  const layoutKey = `${listWidth}|${columns.map(c => c.id ?? c.accessorKey).join(',')}|${groups.length > 0}`
  const [frozen, setFrozen] = useState(null)
  const colWidths = frozen?.key === layoutKey ? frozen.widths : null
  useLayoutEffect(() => {
    if (!isDesktop || colWidths || !groups.length || !tableRef.current) return
    const ths = tableRef.current.querySelectorAll('thead th')
    setFrozen({ key: layoutKey, widths: [...ths].map(th => th.getBoundingClientRect().width) })
  })

  const virtualizer = useWindowVirtualizer({
    count: sortedRows.length,
    // Measured sizes are remembered per venue, not per position: after a filter
    // chip reorders the list, position 5 is a different venue, and reusing its
    // old height made the list correct the scroll position over and over.
    getItemKey: index => sortedRows[index]?.original._venueId ?? sortedRows[index]?.id ?? index,
    // As close to the real row as can be known before drawing it. A row above
    // the screen that turns out taller or shorter than estimated shifts the page
    // when it is first measured — scrolling up through stacked multi-band rows
    // (240px each, estimated at 41) threw the list up and down by that much.
    // Stacked rows are exact: a fixed-height line per band (BAND_LINE_PX).
    estimateSize: index => {
      const lines = sortedRows[index]?.original._entries?.length || 1
      if (lines > 1) return isDesktop ? lines * BAND_LINE_PX + 1 : 70 + lines * 92
      return isDesktop ? 96 : 118
    },
    overscan: 10,
    scrollMargin,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const padTop = virtualRows.length ? virtualRows[0].start - virtualizer.options.scrollMargin : 0
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - virtualizer.options.scrollMargin)
    : 0

  const empty = (
    <p className="px-3 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
      {emptyNote || 'No venues match the current filters.'}
    </p>
  )

  if (!isDesktop) {
    return (
      // overflow-anchor: Chromium's scroll anchoring would correct for the same
      // size changes the virtualizer already corrects for — twice is a jump.
      <div ref={listRef} style={{ overflowAnchor: 'none' }} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {sortedRows.length === 0 ? empty : (
          <>
            <div style={{ height: padTop }} />
            {virtualRows.map(v => {
              const row = sortedRows[v.index]
              return (
                <div key={row.id} data-index={v.index} ref={virtualizer.measureElement}>
                  <MobileSelectable row={row} selectMode={selectMode} selected={selected} onSetSelected={onSetSelected} onStartSelect={onStartSelect}>
                    <MobileCard row={row} edits={edits} onVenueClick={onVenueClick} onEdit={onEdit} />
                  </MobileSelectable>
                </div>
              )
            })}
            <div style={{ height: padBottom }} />
          </>
        )}
      </div>
    )
  }

  return (
    // overflow-anchor: see the mobile list above.
    <div ref={listRef} style={{ overflowAnchor: 'none' }} className={`${pinHead && fits ? 'overflow-x-clip' : 'overflow-x-auto'} rounded-lg border border-gray-200 dark:border-gray-700`}>
      <table
        ref={tableRef}
        className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm ${colWidths ? 'table-fixed' : ''}`}
        style={colWidths ? { width: colWidths.reduce((a, b) => a + b, 0) } : undefined}
      >
        <thead ref={theadRef} className="bg-gray-50 dark:bg-gray-800">
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map((h, i) => (
                <th
                  key={h.id}
                  style={{ ...(colWidths ? { width: colWidths[i] } : {}), ...(pinHead && fits ? { top: 'var(--pin-top, 0px)' } : {}) }}
                  className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide select-none
                    ${pinHead ? `${fits ? 'sticky' : 'relative'} z-20 bg-gray-50 dark:bg-gray-800 shadow-[inset_0_-1px_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_rgb(55_65_81)]` : ''}
                    ${h.column.getCanSort() ? 'cursor-pointer hover:text-gray-800 dark:hover:text-gray-200' : ''}`}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {h.column.getIsSorted() === 'asc' && ' ↑'}
                  {h.column.getIsSorted() === 'desc' && ' ↓'}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                {emptyNote || 'No venues match the current filters.'}
              </td>
            </tr>
          ) : (
            <>
              {padTop > 0 && <tr style={{ height: padTop }} />}
              {virtualRows.map(v => {
                const row = sortedRows[v.index]
                const meta = statusMeta(row.original._status)
                const hasRowEdits = (row.original._entries || [row.original]).some(e => edits[e._idx])
                const highlight = hasRowEdits ? '' : rowHighlight(row.original)
                const isSelected = selectMode && (row.original._entries || [row.original]).every(e => selected?.has(e._idx))
                return (
                  <tr
                    key={row.id}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className={`cursor-pointer ${meta.row || ''} ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : highlight} hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${hasRowEdits && !isSelected ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''} ${selectMode ? 'select-none' : ''}`}
                    onPointerDownCapture={selectMode ? e => selectPointerDown(e, v.index) : undefined}
                    // In Select mode nothing inside a row reacts to a click
                    // (editing a cell, following a link, opening the venue) —
                    // the press already selected it.
                    onClickCapture={selectMode ? e => {
                      if (e.target.closest('input[type="checkbox"]')) return
                      e.preventDefault()
                      e.stopPropagation()
                    } : undefined}
                    onClick={e => {
                      if (e.target.closest('input, textarea, button, a, select')) return
                      const line = e.target.closest('[data-entry]')
                      table.options.meta.onVenueClick(line ? Number(line.dataset.entry) : row.original._idx)
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      // break-words: with frozen widths a long address wraps
                      // instead of spilling into the next column.
                      <td key={cell.id} className="px-3 py-2 align-top break-words">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {padBottom > 0 && <tr style={{ height: padBottom }} />}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
