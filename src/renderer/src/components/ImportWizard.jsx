import { useEffect, useRef, useState } from 'react'
import { APP_COLUMNS } from '@core/constants'
import { parseCsvRaw } from '@core/csv'
import { readFileText } from '../lib/csvFile'
import { guessMapping, applyMapping, mappedCount } from '@core/importMap'
import { api } from '../platform'
import { t, useT } from '../i18n'

const NONE = '' // sentinel: "don't import this app column"
const REQUIRED = ['Venue', 'Band', 'Email']

export default function ImportWizard({ rows = [], onImport, onBack, onClose, preloaded = null, multiBand = false }) {
  const t = useT()
  const [step, setStep] = useState('file') // 'file' | 'mode' | 'map'
  const [parsed, setParsed] = useState(null) // { headers, rows, name, path }
  // Importing only fills the table; the file it came from is not the app's CSV
  // unless this is ticked, in which case Save writes back to it from now on.
  const [adopt, setAdopt] = useState(true)
  const [mode, setMode] = useState('replace') // 'replace' | 'add'
  const [mapping, setMapping] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef(null)

  const hasExisting = rows.length > 0

  async function handleFile(file) {
    if (!file) return
    await ingest({ text: await readFileText(file), name: file.name, path: api.filePathFor(file) })
  }

  // Shared by the drop/pick path and by `preloaded`, which first-run uses to hand
  // over a file the user already chose whose columns need mapping.
  async function ingest({ text, name, path }) {
    setError('')
    setBusy(true)
    try {
      const { headers, rows: srcRows } = await parseCsvRaw(text)
      if (!headers.length || !srcRows.length) {
        setError(t('No rows found in that file. Is it a CSV with a header row?'))
        setBusy(false)
        return
      }
      setParsed({ headers, rows: srcRows, name, path })
      setMapping(guessMapping(headers))
      setStep(hasExisting ? 'mode' : 'map')
      if (!hasExisting) setMode('replace')
    } catch (err) {
      setError(t('Could not read the file: {error}', { error: err?.message || err }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (preloaded?.text) ingest(preloaded)
    // Runs once for the file first-run handed over; re-ingesting on every render
    // would fight the wizard's own step state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloaded])

  function handlePick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    handleFile(file)
  }

  function setColumn(appKey, sourceHeader) {
    setMapping(m => ({ ...m, [appKey]: sourceHeader }))
  }

  // Only meaningful when the whole table comes from this file: adopting the path
  // while appending would silently point Save at a file that is missing rows.
  // Multi-band mode saves to its band files, so there is no one file to adopt.
  const canAdopt = !!parsed?.path && mode === 'replace' && !multiBand

  function handleConfirm() {
    const mapped = applyMapping(parsed.rows, mapping)
    onImport(mapped, mode, { adoptPath: canAdopt && adopt ? parsed.path : null })
    onClose()
  }

  const preview = parsed?.rows?.[0] || {}
  const nMapped = mappedCount(mapping)

  return (
    // No backdrop click-to-close, same as Settings: this page holds work in
    // progress, and a stray click outside it must not throw that away.
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1300] p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div>
            {/* Present only when Settings opened the wizard. */}
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-1 -ml-1 px-1"
              >
                {t("← Settings")}
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t("Import CSV")}</h2>
            {parsed && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-md">
                {parsed.name} · {t('{n} row|{n} rows', { n: parsed.rows.length })} · {t('{n} column|{n} columns', { n: parsed.headers.length })}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}

          {/* Step 1: file */}
          {step === 'file' && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{t("Choose a CSV file to import.")}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                {t("Any CSV works — comma, semicolon, or tab separated. You'll match its columns to the app's on the next step.")}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {busy ? t('Reading…') : t('Choose file…')}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handlePick} className="hidden" />
            </div>
          )}

          {/* Step 2: mode */}
          {step === 'mode' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('You have {n} venue loaded. How should this file come in?|You have {n} venues loaded. How should this file come in?', { n: rows.length })}
              </p>
              {[
                { value: 'replace', title: t('Replace the table'), desc: t('Discard the current rows and load only this file. Nothing is written to GitHub until you Save.') },
                { value: 'add', title: t('Add to existing'), desc: t('Append this file as new venues, keeping your current rows and edits. Duplicates get flagged in the list so you can merge them.') },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                    mode === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-300 dark:ring-indigo-700'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{opt.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Step 3: mapping */}
          {step === 'map' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("Match each booking-app column to a column from your file. We pre-filled the obvious ones — adjust as needed.")} {t('{mapped} of {n} file column mapped.|{mapped} of {n} file columns mapped.', { mapped: nMapped, n: parsed.headers.length })}
              </p>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {APP_COLUMNS.map(col => {
                  const src = mapping[col.key] ?? NONE
                  const previewVal = src ? preview[src] : ''
                  const isReq = REQUIRED.includes(col.key)
                  return (
                    <div key={col.key} className="flex items-center gap-3 px-3 py-2">
                      <div className="w-32 shrink-0">
                        <span className="text-sm text-gray-700 dark:text-gray-200">{t(col.label)}</span>
                        {isReq && <span className="ml-1 text-rose-500 text-xs" title={t("Recommended")}>*</span>}
                      </div>
                      <select
                        value={src}
                        onChange={e => setColumn(col.key, e.target.value)}
                        className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      >
                        <option value={NONE}>{t("— Don't import")}</option>
                        {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <div className="w-32 shrink-0 truncate text-xs text-gray-400 dark:text-gray-500" title={previewVal || ''}>
                        {src ? (previewVal || <span className="italic">{t("empty")}</span>) : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
              {canAdopt && (
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adopt}
                    onChange={e => setAdopt(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span>
                    <span className="block text-sm text-gray-800 dark:text-gray-100">{t("Use this file as my CSV from now on")}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t("Storage switches to")} <span className="font-mono">{parsed.path}</span>{t(", so Save writes back to it and the app reloads from it next time. Leave it off to import the rows into the CSV you already use.")}
                    </span>
                  </span>
                </label>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500">
                <span className="text-rose-500">*</span> {t("recommended for outreach — rows missing them still import, but show as “Missing info”. Values are copied exactly as written.")}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (step === 'map' && hasExisting) setStep('mode')
              else if (step === 'mode') setStep('file')
              else if (onBack) onBack()
              else onClose()
            }}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-2 py-2"
          >
            {step !== 'file' || onBack ? t('Back') : t('Cancel')}
          </button>
          {step === 'mode' && (
            <button
              type="button"
              onClick={() => setStep('map')}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors"
            >
              {t("Next: match columns")}
            </button>
          )}
          {step === 'map' && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={nMapped === 0}
              className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {mode === 'add'
                ? t('Import {n} row (add)|Import {n} rows (add)', { n: parsed.rows.length })
                : t('Import {n} row (replace)|Import {n} rows (replace)', { n: parsed.rows.length })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
