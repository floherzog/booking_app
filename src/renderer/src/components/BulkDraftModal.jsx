import { useState, useMemo, useEffect } from 'react'
import {
  DELIVERY_MODES, REPEAT_OPTIONS, SOURCES, selectRows, sourceRepeats, repeatLabel,
  deliveryForRow, summarizeDelivery, defaultScheduleValue, parseLocalDateTime, pendingJobs,
} from '@core/delivery'
import { prepareDraft, deliverPrepared, draftKey } from '../lib/drafts'
import { useGenders } from '../lib/genders'
import { languageForRow } from '@core/templates'
import { useBackdropClose } from '../lib/useBackdropClose'
import { api } from '../platform'

function whenLabel(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BulkDraftModal({ rows, filteredRows, templates, languages, settings, onDraftCreated, onSent, onClearDraftFlags, onClose }) {
  const backdrop = useBackdropClose(onClose)
  const [source, setSource] = useState('nextBatch')
  const [mode, setMode] = useState('draft')          // 'draft' | 'auto' | 'send'
  const [timing, setTiming] = useState('now')        // 'now' | 'later'
  const [runAt, setRunAt] = useState(() => defaultScheduleValue())
  const [repeat, setRepeat] = useState('once')
  const [confirmSend, setConfirmSend] = useState(false)
  const [skipped, setSkipped] = useState(() => new Set()) // _idx the user unticked
  const [phase, setPhase] = useState('preflight') // preflight | running | done | scheduled
  const [results, setResults] = useState({}) // _idx → { ok, error }
  const [current, setCurrent] = useState(null)
  const [error, setError] = useState('')
  const [queue, setQueue] = useState([])

  // The scheduler lives in main; this is the queue it will actually run.
  useEffect(() => {
    let alive = true
    const refresh = () => api.listScheduledRuns()
      .then(jobs => { if (alive) setQueue(pendingJobs(jobs)) })
      .catch(() => {})
    refresh()
    const off = api.onScheduleUpdate(payload => {
      if (payload?.jobs) setQueue(pendingJobs(payload.jobs))
      else refresh()
    })
    return () => { alive = false; off() }
  }, [])

  // The venues this run would touch — worked out before the preflight so their
  // German genders can be fetched for just these, not for the whole table.
  const picked = useMemo(() => selectRows(source, { rows, filteredRows }), [source, rows, filteredRows])

  const articlesOn = (settings?.templates?.germanArticles ?? 'ondevice') !== 'off'
  const germanVenues = useMemo(
    () => (articlesOn ? picked.filter(r => languageForRow(r, languages) === 'de').map(r => r['Venue']) : []),
    [picked, languages, articlesOn],
  )
  const genderVersion = useGenders(germanVenues, articlesOn)

  // Preflight: everything that could go wrong, worked out before anything runs.
  const candidates = useMemo(() => {
    return picked.map(row => ({
      row,
      prepared: prepareDraft(row, templates, languages, settings),
      delivery: deliveryForRow(row, mode),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, mode, templates, languages, settings, genderVersion])

  const eligible = candidates.filter(c => c.prepared.ok && !skipped.has(c.row._idx))
  const blocked = candidates.filter(c => !c.prepared.ok)
  const counts = summarizeDelivery(eligible.map(c => c.row), mode)
  const scheduledAt = timing === 'later' ? parseLocalDateTime(runAt) : null
  const scheduleInPast = timing === 'later' && scheduledAt && scheduledAt.getTime() < Date.now()

  // Sending is irreversible, so it takes a second, explicit click.
  useEffect(() => { setConfirmSend(false) }, [mode, source, timing, runAt, repeat])

  // "Current view" cannot be worked out again next week, so a repeating run
  // falls back to the next batch rather than silently reusing a stale list.
  useEffect(() => {
    if (repeat !== 'once' && !sourceRepeats(source)) setSource('nextBatch')
  }, [repeat, source])

  function toggle(idx) {
    setSkipped(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Sequential on purpose: each message opens its own connection, and a server
  // will throttle (or drop) a burst of parallel logins.
  async function run() {
    setPhase('running')
    setError('')
    const acc = {}
    for (const { row, prepared, delivery } of eligible) {
      setCurrent(row._idx)
      try {
        await deliverPrepared(prepared, delivery)
        acc[row._idx] = { ok: true, delivery }
        if (delivery === 'send') onSent?.(row)
        else onDraftCreated?.(row)
      } catch (e) {
        acc[row._idx] = { ok: false, delivery, error: e.message }
      }
      setResults({ ...acc })
    }
    setCurrent(null)
    setPhase('done')
  }

  // A one-off run is scheduled as finished messages, so a later template edit
  // cannot change what goes out. A repeating run is scheduled as a recipe and
  // re-picks its venues every time — "every day at 08:00" has to mean today's
  // batch, not the one that happened to be on screen when it was set up.
  async function schedule() {
    setError('')
    try {
      await api.scheduleRun({
        runAt: scheduledAt.toISOString(),
        mode,
        repeat,
        ...(repeat === 'once'
          ? {
            items: eligible.map(({ row, prepared, delivery }) => ({
              key: draftKey(row),
              venue: row['Venue'] || '',
              email: row['Email'] || '',
              delivery,
              draft: prepared.draft,
            })),
          }
          : { recipe: { source } }),
      })
      setPhase('scheduled')
    } catch (e) {
      setError(e.message)
    }
  }

  async function cancelJob(id) {
    try {
      setQueue(pendingJobs(await api.cancelScheduledRun(id)))
    } catch (e) {
      setError(e.message)
    }
  }

  function primaryAction() {
    if (timing === 'later') return schedule()
    if (counts.send > 0 && !confirmSend) { setConfirmSend(true); return undefined }
    return run()
  }

  const succeeded = Object.entries(results).filter(([, r]) => r.ok).map(([idx]) => Number(idx))
  const failed = Object.entries(results).filter(([, r]) => !r.ok)
  const succeededFlagged = succeeded.filter(idx => rows.find(r => r._idx === idx)?.['Draft'] === 'TRUE')
  const sentCount = Object.values(results).filter(r => r.ok && r.delivery === 'send').length

  const outlineBtn = 'text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors'
  const pill = active => `px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${active
    ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`

  const primaryLabel = (() => {
    if (timing === 'later') return repeat === 'once' ? `Schedule ${eligible.length}` : `Schedule ${repeatLabel(repeat).toLowerCase()}`
    if (confirmSend) return `Really send ${counts.send}?`
    if (counts.send && counts.draft) return `Send ${counts.send}, draft ${counts.draft}`
    if (counts.send) return `Send ${counts.send} email${counts.send !== 1 ? 's' : ''}`
    return `Create ${counts.draft} draft${counts.draft !== 1 ? 's' : ''}`
  })()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1300] p-4" {...(phase === 'running' ? {} : backdrop)}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {mode === 'draft' ? 'Create drafts in Mail' : mode === 'send' ? 'Send emails' : 'Send or draft'}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {mode === 'draft'
                ? 'Drafts land in your Drafts mailbox. Nothing is sent, and “Last emailed” is left untouched.'
                : 'Sent mail is recorded as an unsaved “Last emailed” edit — press Save when the run is finished.'}
            </p>
          </div>
          <button onClick={onClose} disabled={phase === 'running'} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none disabled:opacity-30">&times;</button>
        </div>

        {phase === 'preflight' && (
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2.5">
            <div>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map(s => {
                  const unusable = repeat !== 'once' && !sourceRepeats(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSource(s.id); setSkipped(new Set()) }}
                      disabled={unusable}
                      title={unusable ? 'A repeating run cannot reuse the filters you have set right now.' : s.hint}
                      className={`${pill(source === s.id)} disabled:opacity-40`}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{SOURCES.find(s => s.id === source)?.hint}</p>
            </div>

            <div>
              <div className="flex flex-wrap gap-1.5">
                {DELIVERY_MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)} title={m.hint} className={pill(mode === m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{DELIVERY_MODES.find(m => m.id === mode)?.hint}</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={() => setTiming('now')} className={pill(timing === 'now')}>Run now</button>
              <button onClick={() => setTiming('later')} className={pill(timing === 'later')}>At a time…</button>
              {timing === 'later' && (
                <>
                  <input
                    type="datetime-local"
                    value={runAt}
                    onChange={e => setRunAt(e.target.value)}
                    className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-xs py-1"
                  />
                  <select
                    value={repeat}
                    onChange={e => setRepeat(e.target.value)}
                    className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-xs py-1"
                  >
                    {REPEAT_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </>
              )}
            </div>
            {timing === 'later' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {scheduleInPast && repeat === 'once'
                  ? 'That time has already passed — the run would start immediately.'
                  : repeat !== 'once'
                    ? `${scheduleInPast ? 'That time has passed today, so the first run is the next one. ' : ''}Runs ${repeatLabel(repeat).toLowerCase()} from then on, re-picking “${SOURCES.find(s => s.id === source)?.label}” each time — the ticks below apply to a one-off run only. Cancel it here whenever you like.`
                    : 'Scheduled runs only fire while Booking is open. One that came due while it was closed runs at the next launch.'}
              </p>
            )}

            {queue.length > 0 && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {queue.map(job => (
                  <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {job.recipe
                        ? `${SOURCES.find(s => s.id === job.recipe.source)?.label || job.recipe.source}, ${repeatLabel(job.repeat).toLowerCase()}`
                        : `${job.items.length} message${job.items.length !== 1 ? 's' : ''}`}
                      {' · '}{whenLabel(job.runAt)}
                      <span className="text-gray-400 dark:text-gray-500"> · {job.mode}</span>
                    </p>
                    <button onClick={() => cancelJob(job.id)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 shrink-0">
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-1.5">
          {phase === 'scheduled' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300 py-8 text-center">
              Scheduled for {whenLabel(scheduledAt?.toISOString() || runAt)}
              {repeat !== 'once' && `, then ${repeatLabel(repeat).toLowerCase()}`}.<br />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Leave Booking running, or open it again before then.
              </span>
            </p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No venues in this selection.</p>
          ) : candidates.map(({ row, prepared, delivery }) => {
            const result = results[row._idx]
            const isSkipped = skipped.has(row._idx)
            return (
              <div
                key={row._idx}
                className={`flex items-start gap-3 rounded-md border px-3 py-2 ${prepared.ok
                  ? 'border-gray-200 dark:border-gray-700'
                  : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'}`}
              >
                {phase === 'preflight' ? (
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 disabled:opacity-40"
                    checked={prepared.ok && !isSkipped}
                    disabled={!prepared.ok}
                    onChange={() => toggle(row._idx)}
                  />
                ) : (
                  <span className="mt-0.5 w-4 text-center text-sm shrink-0">
                    {current === row._idx ? '…' : result ? (result.ok ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>) : ''}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                    {row['Venue'] || '—'}
                    {row['City'] && <span className="text-gray-400 dark:text-gray-500"> · {row['City']}</span>}
                    {prepared.ok && mode !== 'draft' && (
                      <span className={`ml-2 text-[10px] uppercase tracking-wide font-semibold ${delivery === 'send'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-gray-400 dark:text-gray-500'}`}>
                        {delivery}
                      </span>
                    )}
                  </p>
                  {prepared.ok ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {row['Email']} · <span className="font-mono">{prepared.language}</span>
                      {prepared.fallbackUsed && <span className="text-amber-600 dark:text-amber-400"> · fallback language</span>}
                      {prepared.empties.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400"> · empty: {prepared.empties.join(', ')}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{prepared.reason}</p>
                  )}
                  {result && !result.ok && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{result.error}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {phase === 'done' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {succeeded.length - sentCount} draft{succeeded.length - sentCount !== 1 ? 's' : ''} created
                {sentCount > 0 && <span> · {sentCount} sent</span>}
                {failed.length > 0 && <span className="text-red-600 dark:text-red-400"> · {failed.length} failed</span>}
              </p>
              {succeededFlagged.length > 0 && (
                <button
                  onClick={() => { onClearDraftFlags(succeededFlagged); onClose() }}
                  className={outlineBtn}
                >
                  Clear “Draft” flag on {succeededFlagged.length}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {phase === 'preflight' && `${eligible.length} ready${blocked.length ? ` · ${blocked.length} can't be sent` : ''}`}
              {phase === 'running' && `Working on ${Object.keys(results).length + 1} of ${eligible.length}…`}
              {phase === 'done' && (sentCount > 0
                ? 'Sent mail is staged as a “Last emailed” edit — press Save to write it to the CSV.'
                : 'Drafts may take a few seconds to appear in Mail.')}
              {phase === 'scheduled' && 'You can close this window; the run is stored on disk.'}
            </p>
            <div className="flex gap-3 shrink-0">
              <button onClick={onClose} disabled={phase === 'running'} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40">
                {phase === 'done' || phase === 'scheduled' ? 'Close' : 'Cancel'}
              </button>
              {phase !== 'done' && phase !== 'scheduled' && (
                <button
                  onClick={primaryAction}
                  disabled={phase === 'running' || (repeat === 'once' && eligible.length === 0) || (timing === 'later' && !scheduledAt)}
                  className={`text-white text-sm font-medium px-5 py-2 rounded-md transition-colors disabled:opacity-50 ${confirmSend
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {phase === 'running' ? 'Working…' : primaryLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
