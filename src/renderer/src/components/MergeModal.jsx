import { useState } from 'react'
import { useBackdropClose } from '../lib/useBackdropClose'
import { useEscape } from '../lib/useEscape'
import { fieldLabel } from '@core/constants'

const FIELDS = [
  'Venue', 'Band', 'Type', 'City', 'Country', 'Contact', 'Email', 'Website', 'Time Frame', 'Dates', 'Text',
  'Last emailed', 'Follow Up Date', 'Last played', 'Status', 'Note',
].map(key => ({ key, label: fieldLabel(key) }))

export default function MergeModal({ rowA, rowB, editsA, editsB, onMerge, onClose }) {
  const backdrop = useBackdropClose(onClose)
  useEscape(onClose)
  const effA = { ...rowA, ...(editsA[rowA._idx] || {}) }
  const effB = { ...rowB, ...(editsB[rowB._idx] || {}) }

  const [keepIdx, setKeepIdx] = useState(rowA._idx)

  const initSelections = {}
  FIELDS.forEach(({ key }) => {
    initSelections[key] = (effB[key] && !effA[key]) ? 'B' : 'A'
  })
  const [sel, setSel] = useState(initSelections)

  const diffFields = FIELDS.filter(({ key }) => (effA[key] || '') !== (effB[key] || ''))
  const sameFields = FIELDS.filter(({ key }) => (effA[key] || '') === (effB[key] || '') && (effA[key] || ''))

  function handleMerge() {
    const mergedFields = {}
    FIELDS.forEach(({ key }) => {
      mergedFields[key] = sel[key] === 'A' ? (effA[key] || '') : (effB[key] || '')
    })
    const deleteIdx = keepIdx === rowA._idx ? rowB._idx : rowA._idx
    onMerge(keepIdx, deleteIdx, mergedFields)
  }

  const nameA = effA['Venue'] || 'Venue A'
  const nameB = effB['Venue'] || 'Venue B'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1200] p-4" {...backdrop}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Merge venues</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Click a cell to pick which value to keep</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {/* Keep which? */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Keep as the surviving record</p>
          <div className="grid grid-cols-2 gap-2">
            {[{ idx: rowA._idx, name: nameA }, { idx: rowB._idx, name: nameB }].map(opt => (
              <label key={opt.idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm
                ${keepIdx === opt.idx
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-500 text-indigo-800 dark:text-indigo-200 font-medium'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <input type="radio" className="sr-only" checked={keepIdx === opt.idx} onChange={() => setKeepIdx(opt.idx)} />
                <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${keepIdx === opt.idx ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-500'}`} />
                {opt.name}
              </label>
            ))}
          </div>
        </div>

        {/* Field picker */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {diffFields.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">All fields are identical — just choose which record to keep above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  <th className="text-left pb-3 font-medium w-1/5">Field</th>
                  <th className="text-left pb-3 font-medium w-[42.5%] pr-2">{nameA}</th>
                  <th className="text-left pb-3 font-medium w-[42.5%]">{nameB}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {diffFields.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="py-2 pr-3 text-xs text-gray-400 dark:text-gray-500 align-top pt-3">{label}</td>
                    {(['A', 'B']).map(side => {
                      const val = side === 'A' ? effA[key] : effB[key]
                      const active = sel[key] === side
                      return (
                        <td key={side} className="py-2 pr-2 align-top">
                          <button
                            onClick={() => setSel(s => ({ ...s, [key]: side }))}
                            className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors break-words
                              ${active
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100 ring-1 ring-indigo-300 dark:ring-indigo-600'
                                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              }`}
                          >
                            {val || <span className="italic opacity-50">empty</span>}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sameFields.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              {sameFields.length} field{sameFields.length !== 1 ? 's' : ''} identical and kept as-is:
              {' '}{sameFields.map(f => f.label).join(', ')}.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">The other record will be marked for deletion — review in Save before pushing.</p>
          <div className="flex gap-3 shrink-0">
            <button onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-4 py-2">
              Cancel
            </button>
            <button
              onClick={handleMerge}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
