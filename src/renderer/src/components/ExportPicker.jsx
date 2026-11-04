import { useMemo, useState } from 'react'
import { useT } from '../i18n'

// Settings ▸ Data & storage ▸ Export: the whole list, or only some bands,
// types or countries. Nothing picked in a group means all of it; picks in
// several groups narrow together (Juno + Germany = Juno's German venues).
const FIELDS = [
  { key: 'Band', label: 'Bands' },
  { key: 'Type', label: 'Types' },
  { key: 'Country', label: 'Countries' },
]

export function pickRows(rows, picked) {
  return rows.filter(r => FIELDS.every(({ key }) => {
    const want = picked[key]
    return !want?.size || want.has(String(r[key] || '').trim())
  }))
}

export default function ExportPicker({ rows, onExport, onCancel }) {
  const t = useT()
  const [picked, setPicked] = useState({})
  const values = useMemo(() => Object.fromEntries(FIELDS.map(({ key }) => {
    const counts = new Map()
    for (const r of rows) {
      const v = String(r[key] || '').trim()
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    return [key, [...counts].sort((a, b) => (a[0] === '') - (b[0] === '') || a[0].localeCompare(b[0]))]
  })), [rows])
  const chosen = useMemo(() => pickRows(rows, picked), [rows, picked])

  const toggle = (key, value) => setPicked(prev => {
    const next = new Set(prev[key] || [])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return { ...prev, [key]: next }
  })
  const pill = on => `px-2 py-0.5 rounded-full text-xs border transition-colors ${on
    ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'}`

  return (
    <div className="mt-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
      {FIELDS.map(({ key, label }) => values[key].length > 1 && (
        <div key={key}>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t(label)}
            <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{picked[key]?.size ? t('{n} picked', { n: picked[key].size }) : t('all')}</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {values[key].map(([value, n]) => (
              <button key={value || '∅'} type="button" onClick={() => toggle(key, value)} className={pill(!!picked[key]?.has(value))}>
                {value || t('(empty)')} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-auto">
          {t('{n} venue entry will be exported.|{n} venue entries will be exported.', { n: chosen.length })}
        </span>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1">{t('Cancel')}</button>
        <button type="button" disabled={!chosen.length} onClick={() => onExport(chosen)}
          className="text-xs font-medium px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40">
          {t('Export')}
        </button>
      </div>
    </div>
  )
}
