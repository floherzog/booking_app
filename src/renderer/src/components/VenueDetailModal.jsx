import { useState, useEffect, useRef } from 'react'
import { getMissingFields, STATUS_META } from '@core/constants'
import { normalizeDateText } from '@core/parseDate'
import DateInput from './DateInput'
import { geocodeCity } from '../lib/geocode'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import StatusBadge from './StatusBadge'
import RelDate from './RelDate'
import DraftVenueButton from './DraftVenueButton'
import { caps } from '../platform'
import { lastEmailedColor, followUpColor, lastPlayedColor } from '@core/dateColors'
import { healthMeta } from '../lib/health'
import { isSharedField } from '@core/multiBand'
import { useBackdropClose } from '../lib/useBackdropClose'

function MiniMap({ city, country, status, onOpenMap }) {
  const [pos, setPos] = useState(null)
  const [loading, setLoading] = useState(Boolean(city || country))

  useEffect(() => {
    if (!city && !country) return
    let cancelled = false
    geocodeCity(city, country).then(result => {
      if (cancelled) return
      setPos(result)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [city, country])

  if (loading) return <div className="h-32 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
  if (!pos) return null

  const color = STATUS_META[status]?.mapColor ?? '#9CA3AF'

  return (
    <div className="relative h-32 rounded-lg overflow-hidden group">
      <MapContainer
        center={[pos.lat, pos.lng]} zoom={7}
        zoomControl={false} dragging={false} scrollWheelZoom={false}
        doubleClickZoom={false} touchZoom={false} keyboard={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker
          center={[pos.lat, pos.lng]} radius={8}
          pathOptions={{ color: 'white', fillColor: color, fillOpacity: 1, weight: 2 }}
        />
      </MapContainer>
      <div
        className="absolute inset-0 cursor-pointer group-hover:bg-black/10 transition-colors flex items-end justify-end p-2"
        onClick={onOpenMap}
      >
        <span className="text-xs text-white font-medium bg-black/40 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
          Open in map ↗
        </span>
      </div>
    </div>
  )
}

const SECTIONS = [
  {
    title: 'Venue Info',
    fields: [
      { key: 'Venue', label: 'Venue', type: 'text', span: 2 },
      { key: 'Band', label: 'Band', type: 'select' },
      { key: 'Type', label: 'Type', type: 'select', hint: 'Only "festival", "filler" and "dead" change the classification.' },
      { key: 'City', label: 'City', type: 'text' },
      { key: 'Country', label: 'Country', type: 'text' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'Contact', label: 'Contact person', type: 'text' },
      { key: 'Email', label: 'Email', type: 'email' },
      { key: 'Website', label: 'Website', type: 'url' },
    ],
  },
  {
    title: 'Booking',
    fields: [
      { key: 'Time Frame', label: 'Time Frame', type: 'textarea', span: 2 },
      { key: 'Dates', label: 'Dates', type: 'text', span: 2 },
      { key: 'Text', label: 'Outreach text', type: 'textarea', span: 2, rows: 5 },
    ],
  },
  {
    title: 'History & Status',
    fields: [
      { key: 'Last emailed', label: 'Last Emailed', type: 'date', colorFn: lastEmailedColor },
      { key: 'Follow Up Date', label: 'Follow Up Date', type: 'date', colorFn: followUpColor },
      { key: 'frequency', label: 'Follow-up frequency', type: 'frequency', span: 2, hint: '· how often to re-contact (default 1 month)' },
      { key: 'Last played', label: 'Last Played', type: 'date', colorFn: lastPlayedColor },
      { key: 'Status', label: 'Status', type: 'text' },
      { key: 'Note', label: 'Internal Note', type: 'textarea', span: 2, rows: 3 },
    ],
  },
  {
    title: 'Outreach actions',
    fields: [
      { key: 'Draft', label: 'Auto-draft', type: 'checkbox', hint: 'OpenClaw drafts this venue next' },
      { key: 'Auto', label: 'Auto-send', type: 'checkbox', hint: 'OpenClaw sends without review' },
    ],
  },
]

// Typed ("September 2026") or picked from the calendar; see DateInput.
function DateField({ inputId, value, base, onChange }) {
  return (
    <DateInput
      id={inputId}
      value={value}
      className={base}
      onCommit={v => { if (v !== normalizeDateText(value)) onChange(v) }}
    />
  )
}

const FREQ_PRESETS = ['2 months', '3 months', '6 months']

function deriveFrequency(v) {
  if (!v) return { mode: 'default', custom: '' }
  if (FREQ_PRESETS.includes(v)) return { mode: v, custom: '' }
  return { mode: 'custom', custom: String(v).match(/\d+/)?.[0] ?? '' }
}

function FrequencyField({ fieldDef, value, isEdited, onChange }) {
  const { key, hint } = fieldDef
  const inputId = `vd-${key}`
  const [state, setState] = useState(() => deriveFrequency(value))
  const committed = useRef(value || '')

  useEffect(() => {
    if ((value || '') !== committed.current) {
      committed.current = value || ''
      setState(deriveFrequency(value))
    }
  }, [value])

  function commit(v) {
    committed.current = v
    onChange(key, v)
  }

  function handleSelect(e) {
    const m = e.target.value
    if (m === 'default') {
      setState({ mode: 'default', custom: '' })
      commit('')
    } else if (m === 'custom') {
      setState(s => ({ mode: 'custom', custom: s.custom }))
      commit(state.custom ? `${state.custom} months` : '')
    } else {
      setState({ mode: m, custom: '' })
      commit(m)
    }
  }

  function handleCustom(e) {
    const num = e.target.value.replace(/\D/g, '')
    setState({ mode: 'custom', custom: num })
    commit(num ? `${num} months` : '')
  }

  const base = `block w-full rounded-md text-sm shadow-sm
    focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
    border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100
    ${isEdited ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : ''}`

  return (
    <div className="col-span-2">
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {fieldDef.label}
        {hint && <span className="ml-1 text-gray-300 dark:text-gray-600 font-normal">{hint}</span>}
      </label>
      <div className="flex items-center gap-2">
        <select id={inputId} value={state.mode} onChange={handleSelect} className={`${base} flex-1`}>
          <option value="default">Default (1 month)</option>
          <option value="2 months">2 months</option>
          <option value="3 months">3 months</option>
          <option value="6 months">6 months</option>
          <option value="custom">Custom…</option>
        </select>
        {state.mode === 'custom' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={state.custom}
              onChange={handleCustom}
              placeholder="#"
              className={`${base} w-20`}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">months</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ fieldDef, value, isEdited, onChange, row }) {
  const { key, type, hint, span, rows: rowCount = 3 } = fieldDef
  const inputId = `vd-${key}`
  const [local, setLocal] = useState(value || '')
  const committed = useRef(value || '')

  useEffect(() => {
    if (value !== committed.current) {
      setLocal(value || '')
      committed.current = value || ''
    }
  }, [value])

  function commit(val) {
    committed.current = val
    onChange(key, val)
  }

  if (type === 'checkbox') {
    const checked = value === 'TRUE'
    return (
      <label
        htmlFor={inputId}
        className={`flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm
          ${isEdited
            ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700'
            : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700'}`}
      >
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={e => commit(e.target.checked ? 'TRUE' : '')}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
        />
        <span className="font-medium text-gray-700 dark:text-gray-200">{fieldDef.label}</span>
        {hint && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">{hint}</span>}
      </label>
    )
  }

  const base = `block w-full rounded-md text-sm shadow-sm
    focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
    border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100
    ${isEdited ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : ''}`

  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {fieldDef.label}
        {hint && <span className="ml-1 text-gray-300 dark:text-gray-600 font-normal">{hint}</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          id={inputId}
          value={local}
          onChange={e => { setLocal(e.target.value); commit(e.target.value) }}
          rows={rowCount}
          className={`${base} resize-y`}
        />
      ) : type === 'date' ? (
        <DateField inputId={inputId} value={value} base={base} onChange={v => onChange(key, v)} />
      ) : type === 'select' ? (
        <select
          id={inputId}
          value={local}
          onChange={e => { setLocal(e.target.value); commit(e.target.value) }}
          className={base}
        >
          <option value=""></option>
          {(fieldDef.options || []).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
          {/* Keep the row's current value selectable even if it isn't in the managed list. */}
          {local && !(fieldDef.options || []).includes(local) && <option value={local}>{local}</option>}
        </select>
      ) : (
        <input
          id={inputId}
          type={type}
          value={local}
          onChange={e => { setLocal(e.target.value); commit(e.target.value) }}
          className={base}
        />
      )}
      {fieldDef.colorFn && (type === 'date' ? value : local) && (
        <div className="mt-1">
          <RelDate raw={type === 'date' ? value : local} colorFn={fieldDef.colorFn} row={row} />
        </div>
      )}
    </div>
  )
}

// Multi-band mode: one tab per band this venue is booked for, plus a picker to
// add another. The tab shows the band's status colour, so a glance tells which
// band needs something.
function BandTabs({ entries, activeIdx, edits, bandOptions, onSelect, onAdd }) {
  const bandOf = e => edits[e._idx]?.['Band'] ?? e['Band'] ?? ''
  const taken = new Set(entries.map(bandOf).filter(Boolean))
  const free = bandOptions.filter(b => b && !taken.has(b))
  const sorted = [...entries].sort((a, b) => bandOf(a).localeCompare(bandOf(b)))
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {sorted.map(e => {
        const active = e._idx === activeIdx
        return (
          <button
            key={e._idx}
            onClick={() => onSelect(e._idx)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active
              ? 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
              : 'text-gray-600 border-gray-300 hover:border-gray-400 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500'}`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META[e._status]?.mapColor ?? '#9CA3AF' }} aria-hidden />
            {bandOf(e) || <span className="italic">no band</span>}
          </button>
        )
      })}
      {free.length > 0 && (
        <select
          value=""
          onChange={ev => { if (ev.target.value) onAdd(ev.target.value) }}
          className="rounded-md border-dashed border-gray-300 dark:border-gray-600 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 py-1 pl-2 pr-7"
          title="Book this venue for another band too"
        >
          <option value="">+ Add band…</option>
          {free.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
    </div>
  )
}

export default function VenueDetailModal({ rowIndex, row, edits, onEdit, onClose, onDelete, duplicatePartners = [], onDismissDuplicate, onOpenMerge, onSave, editCount, onOpenMap, bandOptions = [], typeOptions = [], templates = [], languages, settings, draftedAtIso, onDraftCreated, onSent, multiBand = false, entries = [], onSelectEntry, onAddBand, onRemoveBand }) {
  const [confirmDelete, setConfirmDelete] = useState(false) // false | 'band' | 'venue'
  const backdrop = useBackdropClose(onClose)
  const severalBands = multiBand && entries.length > 1
  const rowEdits = edits[rowIndex] || {}
  const effective = { ...row, ...rowEdits }
  const missing = getMissingFields(effective)
  // The row tint in the table is this colour; here it gets a name, because a
  // colour on its own is only meaningful to whoever wrote the legend.
  const health = healthMeta(effective)
  const totalEmails = Number(row['Total emails']) || 0
  const recentEmails = Number(row['Recent emails']) || 0

  function handleChange(field, value) {
    onEdit(rowIndex, field, value)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-[1100]" {...backdrop}>
      <div
        className="bg-white dark:bg-gray-800 h-full w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{effective['Venue'] || 'Venue'}</h2>
              <StatusBadge status={row._status} />
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                title={`${totalEmails} email${totalEmails !== 1 ? 's' : ''} sent all time`}
              >
                {totalEmails} <span className="text-[1.5em] leading-none relative -top-[0.09em]">✉</span> all time
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                title={`${recentEmails} email${recentEmails !== 1 ? 's' : ''} sent since last reply`}
              >
                {recentEmails} <span className="text-[1.5em] leading-none relative -top-[0.09em]">✉</span> since reply
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${health.badge}`}
                title={health.hint}
              >
                <span className={`w-2 h-2 rounded-full ${health.dot}`} aria-hidden />
                {health.label}
              </span>
              {duplicatePartners.map(partner => (
                <span key={partner._idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  Duplicate of {partner['Venue']}
                  <button
                    onClick={() => onOpenMerge(partner)}
                    className="ml-0.5 underline opacity-70 hover:opacity-100 leading-none"
                    title="Merge venues"
                  >Merge</button>
                  <button
                    onClick={() => onDismissDuplicate(row, partner)}
                    className="opacity-60 hover:opacity-100 leading-none"
                    title="Not a duplicate"
                  >×</button>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{[effective['City'], effective['Country']].filter(Boolean).join(', ')}</p>
            {multiBand && (
              <BandTabs
                entries={entries}
                activeIdx={rowIndex}
                edits={edits}
                bandOptions={bandOptions}
                onSelect={idx => { setConfirmDelete(false); onSelectEntry?.(idx) }}
                onAdd={band => { setConfirmDelete(false); onAddBand?.(band) }}
              />
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none mt-0.5">&times;</button>
        </div>

        {missing.length > 0 && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2 shrink-0">
            <span className="text-orange-500 text-sm">⚠</span>
            <span className="text-xs text-orange-700 dark:text-orange-400">
              Missing: <span className="font-medium">{missing.join(', ')}</span>
            </span>
          </div>
        )}

        {Object.keys(rowEdits).length > 0 && (
          <div className="mx-6 mt-2 shrink-0">
            <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-0.5">
              {Object.keys(rowEdits).length} unsaved edit{Object.keys(rowEdits).length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          {(effective['City'] || effective['Country']) && (
            <MiniMap
              city={effective['City']}
              country={effective['Country']}
              status={row._status}
              onOpenMap={onOpenMap}
            />
          )}
          {SECTIONS.map(section => {
            // In multi-band mode the band is chosen with the tabs above, and the
            // section heading says whose data this is: the venue's (every band)
            // or the selected band's.
            const fields = multiBand ? section.fields.filter(f => f.key !== 'Band') : section.fields
            const shared = fields.every(f => isSharedField(f.key))
            const mixed = !shared && fields.some(f => isSharedField(f.key))
            const bandLabel = effective['Band'] || 'no band'
            return (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
                {section.title}
                {severalBands && (
                  <span className="ml-1.5 normal-case font-normal tracking-normal text-gray-300 dark:text-gray-600">
                    · {shared ? 'all bands' : mixed ? `${bandLabel} (Time Frame: all bands)` : bandLabel}
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(f => {
                  const Comp = f.type === 'frequency' ? FrequencyField : Field
                  const OPTIONS = { Band: bandOptions, Type: typeOptions }
                  const fieldDef = OPTIONS[f.key] ? { ...f, options: OPTIONS[f.key] } : f
                  return (
                    <Comp
                      // Per-band fields remount when the tab changes, so a
                      // half-typed value never carries over to another band.
                      key={isSharedField(f.key) ? f.key : `${rowIndex}-${f.key}`}
                      fieldDef={fieldDef}
                      value={effective[f.key] || ''}
                      isEdited={rowEdits[f.key] !== undefined}
                      onChange={handleChange}
                      row={effective}
                    />
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0 flex items-center justify-between gap-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700 dark:text-red-400">
                {confirmDelete === 'band'
                  ? `Stop booking this venue for ${effective['Band']}?`
                  : severalBands ? `Delete this venue for all ${entries.length} bands?` : 'Delete this venue?'}
              </span>
              <button
                onClick={() => {
                  setConfirmDelete(false)
                  if (confirmDelete === 'band') onRemoveBand?.()
                  else onDelete(rowIndex)
                }}
                className="text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200"
              >
                {confirmDelete === 'band' ? 'Yes, remove' : 'Yes, delete'}
              </button>
              <span className="text-red-300">·</span>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {multiBand && effective['Band'] && (
                <button
                  onClick={() => setConfirmDelete('band')}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
                >
                  Remove from {effective['Band']}
                </button>
              )}
              <button
                onClick={() => setConfirmDelete('venue')}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap"
              >
                {severalBands ? 'Delete venue (all bands)' : 'Delete venue'}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            {caps.mail && (
              <DraftVenueButton
                row={effective}
                templates={templates}
                languages={languages}
                settings={settings}
                draftedAtIso={draftedAtIso}
                onDraftCreated={onDraftCreated}
                onSent={onSent}
                showSend
              />
            )}
          {editCount > 0 ? (
            <button
              onClick={onSave}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors shrink-0"
            >
              Save
              <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{editCount}</span>
            </button>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">No unsaved changes</p>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
