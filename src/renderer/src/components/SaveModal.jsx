import { useState, useRef } from 'react'
import { ADVANCED_COLUMNS, fieldLabel } from '@core/constants'
import { useBackdropClose } from '../lib/useBackdropClose'
import { useEscape } from '../lib/useEscape'
import EditableCell from './EditableCell'

const label = fieldLabel
const DATE_FIELDS = new Set(ADVANCED_COLUMNS.filter(c => c.type === 'date').map(c => c.key))
// "Kulturfabrik · Band A": in multi-band mode one venue has a line per band, and
// the list has to say which one changed. Harmless in normal mode.
function venueLabel(row, idx) {
  const name = row['Venue'] || `Row ${idx}`
  return row['Band'] ? `${name} · ${row['Band']}` : name
}

// The last look before writing: every value can still be changed (onEdit, the
// table's own edit path), any one change taken back (onRevert), or all of them
// dropped (onDiscard).
export default function SaveModal({ rows, edits, deletions = new Set(), additions = new Set(), adapter, onSuccess, onClose, onEdit, onRevert, onDiscard }) {
  const backdrop = useBackdropClose(onClose)
  useEscape(onClose)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Every edited cell seen while the dialog is open. One edited back to what
  // was loaded stops being a change but keeps its line, so the field being
  // typed in does not vanish mid-word.
  const seen = useRef(new Map())
  // Set when the underlying file changed since we loaded it — the user has to
  // decide whether their edits win.
  const [conflict, setConflict] = useState(false)

  const changes = []
  deletions.forEach(idx => {
    const row = rows.find(r => r._idx === idx)
    if (row) changes.push({ idx, venue: venueLabel(row, idx), field: '—', oldVal: 'deleted', newVal: '', isDelete: true })
  })
  additions.forEach(idx => {
    if (deletions.has(idx)) return
    const row = rows.find(r => r._idx === idx)
    if (row) changes.push({ idx, venue: venueLabel(row, idx), field: '—', oldVal: '', newVal: 'added', isAdd: true })
  })
  Object.entries(edits).forEach(([idx, fields]) => {
    if (deletions.has(Number(idx))) return
    Object.keys(fields).forEach(field => seen.current.set(`${idx}\u0000${field}`, { idx: Number(idx), field }))
  })
  const lines = [...changes]
  seen.current.forEach(({ idx, field }) => {
    const row = rows.find(r => r._idx === idx)
    if (!row || deletions.has(idx)) return
    const newVal = edits[idx]?.[field]
    const change = { idx, venue: venueLabel(row, idx), field, oldVal: row[field] || '', newVal, reverted: newVal === undefined }
    lines.push(change)
    if (!change.reverted) changes.push(change)
  })
  lines.sort((a, b) => a.venue.localeCompare(b.venue) || a.field.localeCompare(b.field))

  async function handlePush(force = false) {
    setPushing(true)
    setError('')
    try {
      const applied = rows
        .filter(r => !deletions.has(r._idx))
        .map(r => {
          if (!edits[r._idx]) return r
          return { ...r, ...edits[r._idx] }
        })
      const date = new Date().toISOString().slice(0, 10)
      await adapter.save(applied, `Update booking data (${date}) — ${changes.length} change${changes.length !== 1 ? 's' : ''}`, { force })
      onSuccess(applied)
    } catch (e) {
      if (/CSV_CONFLICT/.test(e.message)) {
        setConflict(true)
        setError('')
      } else {
        setError(e.message)
      }
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1300] p-4" {...backdrop}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Save {changes.length} change{changes.length !== 1 ? 's' : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {lines.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">No changes to save.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  <th className="text-left pb-2 font-medium w-1/4">Venue</th>
                  <th className="text-left pb-2 font-medium w-1/5">Field</th>
                  <th className="text-left pb-2 font-medium w-[30%]">Before</th>
                  <th className="text-left pb-2 font-medium w-[30%]">After{onEdit && <span className="normal-case tracking-normal font-normal"> · tap to edit</span>}</th>
                  <th className="pb-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {lines.map(c => (
                  <tr key={`${c.idx}-${c.field}`} className={c.isDelete ? 'bg-red-50 dark:bg-red-900/10' : c.isAdd ? 'bg-emerald-50 dark:bg-emerald-900/10' : c.reverted ? 'opacity-50' : ''}>
                    <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-medium align-top">{c.venue}</td>
                    <td className="py-2 pr-3 align-top">
                      {c.isDelete
                        ? <span className="text-red-600 dark:text-red-400 font-medium text-xs uppercase tracking-wide">Deleted</span>
                        : c.isAdd
                          ? <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs uppercase tracking-wide">Added</span>
                          : <span className="text-gray-500 dark:text-gray-400">{label(c.field)}</span>}
                    </td>
                    <td className={`py-2 pr-3 align-top break-words ${c.reverted ? 'text-gray-400 dark:text-gray-500' : 'text-red-500 dark:text-red-400'}`}>
                      {c.isDelete || c.isAdd ? '' : (c.oldVal || <span className="text-gray-300 dark:text-gray-600 italic">empty</span>)}
                    </td>
                    <td className="py-2 pr-2 text-green-700 dark:text-green-400 font-medium align-top break-words">
                      {c.isDelete ? '' : c.isAdd ? <span className="text-emerald-600 dark:text-emerald-400">new</span>
                        : c.reverted ? <span className="text-gray-400 dark:text-gray-500 font-normal italic">no change</span>
                        : onEdit ? <EditableCell value={c.oldVal} rowIndex={c.idx} field={c.field} edits={edits} onEdit={onEdit} isDate={DATE_FIELDS.has(c.field)} className="text-sm" />
                        : (c.newVal || <span className="text-gray-300 dark:text-gray-600 italic">empty</span>)}
                    </td>
                    <td className="py-2 align-top text-right w-6">
                      {onRevert && !c.reverted && (
                        <button
                          onClick={() => onRevert(c)}
                          title={c.isDelete ? 'Keep this venue' : c.isAdd ? 'Leave this venue out' : 'Take back this change'}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 leading-none px-1"
                        >↺</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {conflict && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-3 space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                The booking file changed since it was loaded.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Something else wrote to it — another Mac via iCloud, the web app, or the booking script.
                Overwriting replaces those changes with what you see here. Cancelling lets you reload first
                (your unsaved edits would be lost).
              </p>
              <button
                onClick={() => handlePush(true)}
                disabled={pushing}
                className="bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                Overwrite anyway
              </button>
            </div>
          )}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          <p className="min-w-0 text-xs text-gray-400 dark:text-gray-500">
            Writes to <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1 rounded break-all">{adapter?.label || 'no storage configured'}</code>
          </p>
          <div className="flex items-center justify-between gap-3">
          <div>
            {onDiscard && changes.length > 0 && (confirmDiscard ? (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-1.5 whitespace-nowrap">
                <span className="text-xs text-red-700 dark:text-red-400">Discard all?</span>
                <button onClick={() => { onDiscard(); onClose() }} className="text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900">Yes</button>
                <span className="text-red-300">·</span>
                <button onClick={() => setConfirmDiscard(false)} className="text-xs text-red-500 hover:text-red-700">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDiscard(true)} disabled={pushing} className="text-sm text-gray-400 hover:text-red-600 px-2 py-1.5 -ml-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">Discard</button>
            ))}
          </div>
          <div className="flex gap-3 shrink-0 justify-end">
            <button onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-4 py-2">
              Cancel
            </button>
            <button
              onClick={() => handlePush()}
              disabled={pushing || changes.length === 0 || !adapter}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {pushing ? 'Saving…' : 'Save'}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
