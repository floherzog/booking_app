import { useState } from 'react'
import { parseCsvRaw } from '@core/csv'
import { looksLikeAppCsv } from '@core/importMap'
import { planOpenBandFiles, openBandFiles } from '../lib/multiBandSwitch'
import BandFilesPlan from './BandFilesPlan'

// Shown until a storage adapter is configured: pick an existing CSV, create a
// fresh one with just the canonical header row, or point at a GitHub repo.
// Also shown when the configured file has gone missing (`missingPath` set), with
// one more choice: put an empty file back where the old one was.
export default function FirstRun({ settings, missingPath = null, onConfigured, onNeedsMapping }) {
  const [mode, setMode] = useState('file')
  const [repo, setRepo] = useState(settings?.storage?.github?.repo || '')
  const [path, setPath] = useState(settings?.storage?.github?.path || '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Multi-band mode: an existing set of band files, found from the one picked.
  const [bandPlan, setBandPlan] = useState(null)

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function choose() {
    return run(async () => {
      const picked = await window.bookingApi.pickCsvOpen()
      if (!picked) return
      // A file the app, the webapp or the scripts wrote already uses the canonical
      // column names and can be adopted as-is. Anyone else's spreadsheet cannot:
      // pointing the adapter straight at it used to "work" and then show a table
      // of empty columns, so hand it to the import wizard's mapping step instead.
      const { text } = await window.bookingApi.readCsvFile(picked)
      const { headers } = await parseCsvRaw(text)
      if (!looksLikeAppCsv(headers) && onNeedsMapping) {
        onNeedsMapping({ text, name: picked.split('/').pop(), path: picked })
        return
      }
      await onConfigured({ adapter: 'file', filePath: picked })
    })
  }

  function create() {
    return run(async () => {
      const picked = await window.bookingApi.pickCsvSave('booking.csv')
      if (!picked) return
      await window.bookingApi.createCsvFile(picked)
      await onConfigured({ adapter: 'file', filePath: picked })
    })
  }

  function recreate() {
    return run(async () => {
      await window.bookingApi.createCsvFile(missingPath)
      await onConfigured({ adapter: 'file', filePath: missingPath })
    })
  }

  function pickBandFiles() {
    return run(async () => {
      setBandPlan(null)
      const picked = await window.bookingApi.pickCsvOpen()
      if (picked) setBandPlan(await planOpenBandFiles(picked))
    })
  }

  function useBandFiles() {
    return run(async () => {
      await onConfigured(await openBandFiles(settings, bandPlan))
    })
  }

  function connectGithub() {
    return run(async () => {
      if (!repo.trim() || !path.trim()) throw new Error('Enter both a repository and a file path.')
      if (token.trim()) await window.bookingApi.setSecret('githubToken', token.trim())
      else if (!(await window.bookingApi.hasSecret('githubToken'))) {
        throw new Error('A personal access token with repo access is required.')
      }
      await onConfigured({ adapter: 'github', github: { repo: repo.trim(), path: path.trim() } })
    })
  }

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
  const tab = active => `px-3 py-1.5 text-sm transition-colors ${active
    ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
    : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`
  const primary = 'bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50'
  const secondary = 'text-sm font-medium px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors disabled:opacity-50'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6 transition-colors">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 space-y-6">
        {missingPath !== null && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">Your booking file is gone.</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 break-all">
              Nothing is at <span className="font-mono">{missingPath || '(no path)'}</span> any more — it was
              deleted, moved or renamed. Start an empty list in the same place, or choose where it is now.
            </p>
            {missingPath && (
              <button onClick={recreate} disabled={busy} className="bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50">
                Create an empty one there
              </button>
            )}
          </div>
        )}

        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Where is your booking list?</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            The app reads and writes one semicolon-delimited CSV. Put it in iCloud Drive to keep
            it in sync across your Macs — just don’t edit it in two places at once.
          </p>
        </div>

        <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden w-fit">
          <button onClick={() => setMode('file')} className={tab(mode === 'file')}>Local file</button>
          <button onClick={() => setMode('github')} className={`${tab(mode === 'github')} border-l border-gray-200 dark:border-gray-700`}>GitHub</button>
        </div>

        {mode === 'file' ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              <button onClick={choose} disabled={busy} className={primary}>Choose CSV…</button>
              <button onClick={create} disabled={busy} className={secondary}>Create a new one…</button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              A new file starts with the app’s 22 column headers and no venues.
            </p>
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={pickBandFiles} disabled={busy} className={secondary}>Open band files…</button>
                <span className="inline-block rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Multi-band mode</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Already keeping one CSV per band (multi-band mode on another Mac)? Pick any one of the band
                files — the rest of the set is found in its folder, and multi-band mode is switched on.
              </p>
              <BandFilesPlan
                plan={bandPlan}
                multiBandOn={false}
                fresh
                busy={busy}
                onConfirm={useBandFiles}
                onCancel={() => setBandPlan(null)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={lbl}>Repository (owner/name)</label>
              <input className={input} value={repo} onChange={e => setRepo(e.target.value)} placeholder="you/booking_list" />
            </div>
            <div>
              <label className={lbl}>File path in the repo</label>
              <input className={input} value={path} onChange={e => setPath(e.target.value)} placeholder="data/booking.csv" />
            </div>
            <div>
              <label className={lbl}>Personal access token (repo scope)</label>
              <input type="password" className={input} value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_…" />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Stored in your macOS keychain. It never leaves this Mac and is never shown again.
              </p>
            </div>
            <button onClick={connectGithub} disabled={busy} className={primary}>Connect</button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}
      </div>
    </div>
  )
}
