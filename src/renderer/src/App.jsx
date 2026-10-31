import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { classifyBooking, classifyContext, classifyContextKey } from '@core/classify'
import { getSettings, saveSettings } from './lib/config'
import { APP_COLUMNS, getMissingSeverity } from '@core/constants'
import { effectiveBandOptions, bandsFromRows, normalizeBands } from '@core/bands'
import { effectiveTypeOptions } from '@core/venueTypes'
import { computeNextBatch } from '@core/nextBatch'
import { computeDuplicates, dismissPair } from '@core/duplicates'
import { bandDateGaps, gapsKey, agreedDates, keepKey } from '@core/bandDates'
import { EMPTY_FILTERS, matchesFilters, normalizeFilterChips } from '@core/filterRows'
import { linkVenues, reconcileShared, isMultiBand, isSharedField, SHARED_FIELDS } from '@core/multiBand'
import { enableMultiBand, disableMultiBand, openBandFiles, createNewBandSet, relocateBandFiles, forgetBandFiles } from './lib/multiBandSwitch'
import { mergeRules } from '@core/rules'
import { RulesProvider, ClassifyProvider } from './lib/rulesContext'
import { getAdapter, isStorageConfigured } from './lib/storageAdapters'
import FirstRun from './components/FirstRun'
import { syncFromMail, mailSyncEnabled } from './lib/mailSync'
import { listTemplates } from './lib/templates'
import { draftKey, draftedAt, createDraft, prepareDraft, deliverPrepared, resolveForDraft } from './lib/drafts'
import { selectRows, deliveryForRow } from '@core/delivery'
import { formatDateDDMMYY } from '@core/parseDate'
import StatsBar from './components/StatsBar'
import FilterBar from './components/FilterBar'
import BookingTable from './components/BookingTable'
import MapView from './components/MapView'
import SettingsPanel from './components/SettingsPanel'
import ImportWizard from './components/ImportWizard'
import SaveModal from './components/SaveModal'
import LogicModal from './components/LogicModal'
import VenueDetailModal from './components/VenueDetailModal'
import MergeModal from './components/MergeModal'
import BulkEditBar from './components/BulkEditBar'
import { useInlinePrompt } from './components/InlinePrompt'
import ErrorBoundary from './components/ErrorBoundary'
import UpdateBanner from './components/UpdateBanner'
import BandDatesBanner from './components/BandDatesBanner'
import ActionDock from './components/ActionDock'
import { api, caps } from './platform'
import { checkOpenclawPolicy } from './lib/policySync'

// Mail-only views, loaded when first opened: they carry the template editor
// (TipTap), which the web build never shows and so never downloads.
const TemplatesManager = lazy(() => import('./components/TemplatesManager'))
const BulkDraftModal = lazy(() => import('./components/BulkDraftModal'))


export default function App() {
  // The whole persisted config lives in the main process (userData/settings.json);
  // null until the first settings:get resolves.
  const [settings, setSettings] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // The configured CSV file is gone (deleted, moved, renamed). Set to its path,
  // which sends the user back to the first-run screen to recreate or replace it.
  const [missingFile, setMissingFile] = useState(null)
  // Web build: no GitHub token in the bundle or this browser yet. Shows the
  // first-run screen, which asks for one.
  const [needsToken, setNeedsToken] = useState(false)
  // Web build: how OpenClaw's hold logic differs from the Rules, if it does.
  const [policyDrift, setPolicyDrift] = useState([])
  const [lastFetched, setLastFetched] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [promptNode, ask] = useInlinePrompt()
  const [showImport, setShowImport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  // Templates and Import are reachable both from Settings and on their own.
  // When Settings opened one, it gets a "← Settings" button back to where the
  // user came from.
  const [cameFromSettings, setCameFromSettings] = useState(false)
  // A CSV chosen on first run whose columns don't match ours, awaiting mapping.
  const [importSeed, setImportSeed] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [showBulkDraft, setShowBulkDraft] = useState(false)
  const [templates, setTemplates] = useState([])
  // Transient per-row draft feedback for the table action.
  const [draftingIdx, setDraftingIdx] = useState(null)
  const [draftResults, setDraftResults] = useState({})
  const [showSave, setShowSave] = useState(false)
  const [showLogic, setShowLogic] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [venueDetail, setVenueDetail] = useState(null)
  const [update, setUpdate] = useState(null) // a newer release, for the banner
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [edits, setEdits] = useState({})
  const [deletions, setDeletions] = useState(new Set())
  const [additions, setAdditions] = useState(new Set()) // _idx of imported/new rows (no edits of their own)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [mapFocusRow, setMapFocusRow] = useState(null)
  const [mergeTarget, setMergeTarget] = useState(null) // { rowA, rowB }
  const [view, setView] = useState('list')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set()) // _idx of bulk-selected rows
  // The adapter instance that actually performed the last load — it carries the
  // mtime/sha conflict-guard token that Save needs.
  const [adapter, setAdapter] = useState(null)

  const today = useMemo(() => new Date(), [])
  const rules = useMemo(() => mergeRules(settings?.rules), [settings])
  const multiBand = isMultiBand(settings)
  // What classifying needs beyond the rules: the venue-type rules, which bands
  // have Dates, and — once the app has templates of its own — which bands have
  // one. A list drafted elsewhere (OpenClaw) has no templates here, so then
  // nothing is held back for want of one. Keyed, so the reclassify effect below
  // runs only when the context really changes.
  const templatesForCtx = caps.mail && templates.length ? templates : null
  const templatesRef = useRef(templatesForCtx)
  templatesRef.current = templatesForCtx
  const ctxNow = classifyContext(settings, templatesForCtx)
  const ctxKey = classifyContextKey(ctxNow)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classifyCtx = useMemo(() => ctxNow, [ctxKey])

  // Single writer for the settings file: persist, then adopt whatever main
  // actually stored (it re-applies defaults and merges the rules).
  const persist = useCallback(async next => {
    const saved = await saveSettings(next)
    setSettings(saved)
    return saved
  }, [])

  // Read the CSV through whichever adapter is configured, classify, and stage
  // it. A not-yet-configured adapter simply yields an empty table (FirstRun is
  // what the user sees in that case anyway).
  const load = useCallback(async (settingsOverride) => {
    const s = settingsOverride || settings
    if (!s) return
    const a = getAdapter(s)
    setAdapter(a)
    if (!a.configured) { setRows([]); return }
    setLoading(true)
    setError('')
    try {
      const activeRules = mergeRules(s.rules)
      const { rows: raw, missing = [] } = await a.load()
      setMissingFile(null)
      setNeedsToken(false)
      const multi = isMultiBand(s)
      const ctx = classifyContext(s, templatesRef.current)
      const classified = linkVenues(raw.map((r, i) => ({ ...r, _idx: i, _status: classifyBooking(r, today, activeRules, ctx) })), multi)
      const nextBatchSet = computeNextBatch(classified, today, activeRules)
      const loaded = classified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r, ctx) }))
      setRows(loaded)
      // Band files that disagree about a venue's shared data (edited outside the
      // app, or separate rows before the split) are made to agree — staged, like
      // a mail sync, so nothing reaches the files before Save.
      const fixes = multi ? reconcileShared(classified) : []
      const staged = {}
      for (const f of fixes) staged[f._idx] = { ...staged[f._idx], [f.field]: f.value }
      setEdits(staged)
      const notes = []
      const bandFiles = multi ? Object.keys(s.storage.multiBand.files || {}).length + 1 : 0
      if (multi && missing.length >= bandFiles) {
        notes.push(`The band files folder ${s.storage.multiBand.dir} is gone (moved, renamed or deleted), so the list is empty. In Settings ▸ Data & storage, choose where it is now, or switch back to a single CSV.`)
      } else if (missing.length) {
        notes.push(`Missing band file${missing.length !== 1 ? 's' : ''} ${missing.join(', ')} — treated as empty and recreated on the next Save.`)
      }
      if (fixes.length) notes.push(`${new Set(fixes.map(f => f._idx)).size} band entr${fixes.length !== 1 ? 'ies' : 'y'} had venue details that differed from the same venue's other bands — staged the most recently emailed version for review. Save to apply.`)
      if (notes.length) setSyncNote(notes.join(' '))
      setDeletions(new Set())
      setAdditions(new Set())
      setLastFetched(new Date())
      // One-time seed of the managed band list from bands already in the CSV.
      if (!s.bands || s.bands.length === 0) {
        // A band's Dates are filled in only when all its venues agree on them;
        // otherwise Settings ▸ Bands offers what the venues have.
        const seeded = bandsFromRows(raw).map(name => ({ name, tourDates: agreedDates(raw, name) }))
        if (seeded.length) await persist({ ...s, bands: seeded })
      }
      // Handed back so a caller that loads and then adds to the list (importing
      // band files right after switching multi-band on) builds on these rows,
      // not on the state it captured before the load.
      return loaded
    } catch (e) {
      if (/GITHUB_TOKEN_MISSING/.test(e.message)) {
        setNeedsToken(true)
      } else if (/CSV_MISSING/.test(e.message)) {
        setMissingFile(s.storage?.filePath || '')
        setRows([])
        setLastFetched(null)
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [today, settings, persist])

  // The macOS menu bar drives the same panels as the in-app buttons. These are
  // the only channels main is allowed to push (see the preload's allowlist).
  useEffect(() => {
    const offSettings = api.onMenu('menu:openSettings', () => setShowSettings(true))
    const offTemplates = api.onMenu('menu:openTemplates', () => setShowTemplates(true))
    return () => { offSettings(); offTemplates() }
  }, [])

  // The scheduler in main reports finished runs here, so a scheduled draft is
  // logged and a scheduled send lands on its row exactly like an interactive one.
  // A repeating run is executed here rather than in main: "every day at 08:00"
  // has to mean today's venues and today's templates, which only the renderer
  // has. Main hands over the recipe and waits for the report.
  async function runScheduledRecipe(job) {
    if (!settings || rows.length === 0) {
      // Right after launch the table is still loading; put it back in the queue.
      await api.reportScheduledRun(job.id, { deferred: true })
      return
    }
    const picked = selectRows(job.recipe.source, { rows, filteredRows })
    await resolveForDraft(picked, settings)
    const results = []
    for (const row of picked) {
      const delivery = deliveryForRow(row, job.recipe.mode)
      const key = draftKey(row)
      const prepared = prepareDraft(row, templates, settings.languages, settings)
      if (!prepared.ok) {
        results.push({ key, delivery, ok: false, error: prepared.reason, local: true })
        continue
      }
      try {
        await deliverPrepared(prepared, delivery)
        results.push({ key, delivery, ok: true, local: true })
        if (delivery === 'send') recordSend(row)
        else recordDraft(row)
      } catch (e) {
        results.push({ key, delivery, ok: false, error: e.message, local: true })
      }
    }
    await api.reportScheduledRun(job.id, { results })
  }

  const onScheduleDone = useRef(null)
  onScheduleDone.current = payload => {
    if (payload?.reason === 'run' && payload.job?.recipe) {
      runScheduledRecipe(payload.job).catch(e => setError(`Scheduled run: ${e.message}`))
      return
    }
    if (payload?.reason !== 'completed') return
    const failures = []
    for (const result of payload.results || []) {
      // A repeating run already recorded its own outcome as it went.
      if (result.local) { if (!result.ok) failures.push(result.error); continue }
      if (!result.ok) { failures.push(result.error); continue }
      // Rows move between runs, so a result is matched by its venue key.
      const row = rows.find(r => draftKey(r) === result.key)
      if (!row) continue
      if (result.delivery === 'send') recordSend(row)
      else recordDraft(row)
    }
    if (failures.length) setError(`Scheduled run: ${failures.length} message${failures.length !== 1 ? 's' : ''} failed — ${failures[0]}`)
  }
  // Subscribed once; the ref keeps the handler looking at the current rows.
  useEffect(() => api.onScheduleUpdate(p => onScheduleDone.current?.(p)), [])

  // Updates: once per launch when Settings ▸ General asks for it, quietly — the
  // banner appears only for something newer, and not again for a version the
  // user dismissed. "Check for Updates…" in the menu always shows it.
  const updateChecked = useRef(false)
  useEffect(() => {
    if (!settings || updateChecked.current) return
    updateChecked.current = true
    if (!caps.updates || !settings.general?.autoCheckUpdates) return
    api.checkForUpdates().then(r => {
      let dismissed = null
      try { dismissed = localStorage.getItem('dismissedUpdate') } catch { /* storage unavailable */ }
      if (r?.newer && r.latest !== dismissed) setUpdate(r)
    }).catch(() => { /* offline: say nothing */ })
  }, [settings])
  useEffect(() => api.onUpdateAvailable(r => setUpdate(r)), [])

  function dismissUpdate() {
    try { localStorage.setItem('dismissedUpdate', update?.latest || '') } catch { /* storage unavailable */ }
    setUpdate(null)
  }

  // Kick off the initial fetch once on mount. Fetching is a legitimate effect and the
  // setLoading/setRows calls inside load() are its whole purpose, so opt out of the
  // set-state-in-effect heuristic here (same rationale as the exhaustive-deps opt-out).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    getSettings().then(s => {
      setSettings(s)
      setDismissed(new Set(s.dismissedDupes || []))
      load(s)
    }).catch(e => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A long IMAP scan must stage against the rows as they are when it finishes,
  // not the snapshot it started with.
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // Ask the mail account what it knows about these venues and stage the result.
  //
  // Staged, not written: the edits land in the same `edits` map a hand edit uses,
  // so they show as pending changes and go to the CSV only when Save is pressed.
  const runMailSync = useCallback(async ({ silent = false } = {}) => {
    if (!caps.mail || !mailSyncEnabled(settings)) return
    setSyncing(true)
    if (!silent) setSyncNote('')
    try {
      const result = await syncFromMail(rowsRef.current, settings)
      if (result?.error) { setSyncNote(result.error); return }
      const found = result?.edits || []
      found.forEach(e => handleEdit(e._idx, e.field, e.value))
      setSyncNote(found.length
        ? `Mail sync staged ${found.length} change${found.length !== 1 ? 's' : ''} — review and Save.`
        : 'Mail sync found nothing new.')
    } catch (e) {
      setSyncNote(e.message)
    } finally {
      setSyncing(false)
    }
    // handleEdit is stable enough for this; rows are read through a ref so a long
    // scan never stages against a stale snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  // The ↻ button: reload the CSV, then (when configured) ask the mail account.
  // Order matters — load() clears staged edits, so syncing first would wipe them.
  const refreshAll = useCallback(async () => {
    await load()
    await runMailSync({ silent: true })
  }, [load, runMailSync])

  // Once after the first load, if the user asked for it.
  const syncedOnOpen = useRef(false)
  useEffect(() => {
    if (syncedOnOpen.current || loading || rows.length === 0) return
    if (!caps.mail || !settings?.mail?.sync?.onOpen || !mailSyncEnabled(settings)) return
    syncedOnOpen.current = true
    runMailSync({ silent: true })
  }, [loading, rows.length, settings, runMailSync])

  const refreshTemplates = useCallback(() => {
    if (!caps.mail) return
    listTemplates().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTemplates()
  }, [refreshTemplates])

  // Reclassify in place whenever the rules change — or the venue-type rules,
  // band Dates or templates — so the edit shows up on the badges and the next-batch chip
  // immediately, no reload needed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(prev => {
      if (prev.length === 0) return prev
      const reclassified = prev.map(r => ({ ...r, _status: classifyBooking(r, today, rules, classifyCtx) }))
      const nextBatchSet = computeNextBatch(reclassified, today, rules)
      return reclassified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r, classifyCtx) }))
    })
  }, [rules, today, classifyCtx])

  // Web build: compare the Rules with OpenClaw's script (read once per session),
  // again whenever the Rules change.
  const openclawKey = JSON.stringify(settings?.openclaw || null)
  useEffect(() => {
    if (!caps.openclawPolicy || openclawKey === 'null') return
    checkOpenclawPolicy({ openclaw: JSON.parse(openclawKey) }, rules).then(setPolicyDrift).catch(() => {})
  }, [openclawKey, rules])

  // When a band's Dates change in Settings, offer to push them onto that band's
  // venue rows (Dates column). Applied as
  // normal unsaved edits — they reach the CSV only via the existing Save flow.
  function propagateBandChanges(oldBands, newBands) {
    // Multi-band mode: a band renamed in place (same position in the list, the
    // old name gone) is offered to its venues too, and its file follows it —
    // otherwise its venues would keep the old name and the old file.
    if (multiBand && oldBands?.length === newBands.length) {
      const newNames = new Set(newBands.map(b => b.name))
      newBands.forEach((nb, i) => {
        const from = oldBands[i]?.name
        if (!from || !nb.name || from === nb.name || newNames.has(from)) return
        const matching = rows.filter(r => r['Band'] === from && !deletions.has(r._idx))
        if (!matching.length) return
        if (window.confirm(`Rename "${from}" to "${nb.name}" on its ${matching.length} venue(s) too? Its band file keeps its name.`)) {
          adapter?.renameBand?.(from, nb.name)
          applyEdits(matching.map(r => [r._idx, 'Band', nb.name]))
        }
      })
    }
    const oldByName = new Map((oldBands || []).map(b => [b.name, b]))
    for (const nb of newBands) {
      const ob = oldByName.get(nb.name)
      if (!ob) continue // new or renamed band — nothing to compare against
      const matching = rows.filter(r => r['Band'] === nb.name && !deletions.has(r._idx))
      if (!matching.length) continue

      if (nb.tourDates !== ob.tourDates && nb.tourDates) {
        if (window.confirm(`Set the "Dates" column for ${matching.length} "${nb.name}" venue(s) to "${nb.tourDates}"?`)) {
          matching.forEach(r => handleEdit(r._idx, 'Dates', nb.tourDates))
        }
      }
    }
  }

  // Rules are edited in the Logic modal (which also draws them), reachable from
  // the main view and from Settings ▸ Rules. Both land here.
  async function handleRulesSave(nextRules) {
    await persist({ ...settings, rules: nextRules })
  }

  // Settings ▸ Data & storage ▸ "Start a new, empty CSV". The panel has already
  // asked twice; this overwrites the configured CSV with just the header row
  // and throws away every unsaved edit along with the venues.
  async function handleNewCsv() {
    const a = adapter || getAdapter(settings)
    await a.save([], 'Start a new, empty booking list', { force: true })
    await load()
  }

  // Settings ▸ General ▸ Multi-band mode. Both directions rewrite files and the
  // storage settings, so they refuse while there are unsaved edits (the panel
  // says so) and reload from disk afterwards. Returns the stored settings so the
  // still-open panel can adopt the new storage section.
  async function handleSetMultiBand(on) {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    const storage = on
      ? await enableMultiBand(settings)
      : await disableMultiBand(settings, rows)
    const saved = await persist({ ...settings, storage })
    await load(saved)
    return saved
  }

  // Settings ▸ Data & storage ▸ Multi-band mode, and the first-run screen. Each
  // rewrites the storage section and reloads, so — like the switch — they wait
  // for unsaved edits to be saved or discarded. All return the stored settings
  // for the still-open panel to adopt.
  async function switchStorage(storage) {
    const saved = await persist({ ...settings, storage })
    await load(saved)
    return saved
  }

  // Use a set of band files that already exists (found from the one picked).
  async function handleOpenBandFiles(plan) {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    return switchStorage(await openBandFiles(settings, plan))
  }

  // The band files' folder moved (or should): see planRelocate.
  async function handleRelocateBandFiles(plan) {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    return switchStorage(await relocateBandFiles(settings, plan))
  }

  // Band files that are gone: back to the single CSV, without merging.
  async function handleForgetBandFiles() {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    return switchStorage(forgetBandFiles(settings))
  }

  // Start a new, empty set of band files somewhere else; the current files stay.
  async function handleNewBandSet(plan) {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    return switchStorage(await createNewBandSet(settings, plan))
  }

  // Add the venues of several band files. With multi-band mode off it is
  // switched on first (the current CSV is split, as in General), and the
  // venues are added to the list that produced. Staged: they reach the band
  // files on Save, like any import. → { saved, added }
  async function handleImportBandFiles(plan) {
    if (editCount > 0) throw new Error('Save or discard your unsaved changes first.')
    let saved = settings
    let base = rows
    if (!multiBand) {
      saved = await persist({ ...settings, storage: await enableMultiBand(settings) })
      base = (await load(saved)) || []
    }
    const added = appendImported(base, plan.rows, true)
    return { saved, added }
  }

  async function handleSettingsSave(form) {
    const bands = normalizeBands(form.bands)
    propagateBandChanges(settings.bands, bands)
    const saved = await persist({ ...settings, ...form, bands })
    // A rules change reclassifies through the effect below; a storage change
    // means the venues themselves come from somewhere else now, so refetch.
    if (JSON.stringify(saved.storage) !== JSON.stringify(settings.storage)) await load(saved)
    // Returned so the still-open panel can adopt exactly what was stored.
    return saved
  }

  // A created draft is recorded in settings, never on the venue row: a draft
  // is not a sent email, so "Last emailed" must stay exactly as it was.
  const recordDraft = useCallback(async row => {
    const at = new Date().toISOString()
    setSettings(prev => (prev ? { ...prev, draftLog: { ...prev.draftLog, [draftKey(row)]: at } } : prev))
    try {
      const current = await getSettings()
      await persist({ ...current, draftLog: { ...current.draftLog, [draftKey(row)]: at } })
    } catch { /* the log is a convenience; a failed write must not break drafting */ }
  }, [persist])

  // A sent email is the opposite of a draft: it belongs on the row. Staged as an
  // ordinary edit so it goes through SaveModal like every other change.
  // Stamping today's date on a send is one of three options for keeping this
  // column honest (Settings ▸ Mail settings): the IMAP scan reads the real date
  // from Sent instead, and "off" leaves the column entirely to the user.
  function recordSend(row) {
    if ((settings?.mail?.sync?.lastEmailed || 'onSend') !== 'onSend') return
    handleEdit(row._idx, 'Last emailed', formatDateDDMMYY(new Date()))
  }

  async function handleQuickDraft(row) {
    setDraftingIdx(row._idx)
    try {
      await resolveForDraft([row], settings)
      await createDraft(row, templates, settings.languages, settings)
      setDraftResults(prev => ({ ...prev, [row._idx]: { ok: true } }))
      await recordDraft(row)
    } catch (e) {
      setDraftResults(prev => ({ ...prev, [row._idx]: { ok: false, error: e.message } }))
      setError(e.message)
    } finally {
      setDraftingIdx(null)
    }
  }

  // Staged as ordinary edits so the change goes through SaveModal like any other.
  function clearDraftFlags(idxs) {
    idxs.forEach(idx => handleEdit(idx, 'Draft', ''))
  }

  function handleEdit(rowIndex, field, value) {
    // Looked up by _idx, never by position: after a save that deleted rows (or
    // an "add" import) the two drift apart, and comparing against some other
    // row's value silently dropped edits — clearing a field to "" whenever that
    // other row's field happened to be empty, for instance.
    const originalRow = rows.find(r => r._idx === rowIndex)
    const changes = [[rowIndex, field, value]]

    if (field === 'Band' && value) {
      // Multi-band mode: a venue has each band at most once. Moving this entry
      // to a band another of its entries already has would merge two files'
      // worth of history into one line, so it is refused.
      if (multiBand && originalRow) {
        const clash = rows.some(r => r._venueId === originalRow._venueId && r._idx !== rowIndex
          && !deletions.has(r._idx) && (edits[r._idx]?.['Band'] ?? r['Band']) === value)
        if (clash) { setError(`${originalRow['Venue'] || 'This venue'} already has ${value}.`); return }
      }
      // Swapping a venue's band also fills its Dates from that band's Dates
      // text (only when the band has one — never wipe an existing Dates value).
      const band = (settings?.bands || []).find(b => b.name === value)
      if (band?.tourDates) changes.push([rowIndex, 'Dates', band.tourDates])
    }

    // Raw venue data is the same on every band of a venue, so an edit to it is
    // an edit to all of the venue's entries.
    if (multiBand && isSharedField(field) && originalRow) {
      for (const r of rows) {
        if (r._venueId === originalRow._venueId && r._idx !== rowIndex) changes.push([r._idx, field, value])
      }
    }
    applyEdits(changes)
  }

  // [[_idx, field, value], …] → staged edits. A value equal to what was loaded
  // un-stages that cell instead.
  function applyEdits(changes) {
    const byIdx = new Map(rows.map(r => [r._idx, r]))
    setEdits(prev => {
      const next = { ...prev }
      for (const [idx, f, v] of changes) {
        const rowEdits = { ...(next[idx] || {}) }
        if (v === (byIdx.get(idx)?.[f] ?? '')) delete rowEdits[f]
        else rowEdits[f] = v
        if (Object.keys(rowEdits).length) next[idx] = rowEdits
        else delete next[idx]
      }
      return next
    })
  }

  function handleSaveSuccess(updatedRows) {
    // A multi-band save may have started a file for a new band; remember it.
    if (adapter?.kind === 'multiBand' && JSON.stringify(adapter.manifest) !== JSON.stringify(settings.storage.multiBand)) {
      persist({ ...settings, storage: { ...settings.storage, multiBand: adapter.manifest } }).catch(e => setError(e.message))
    }
    const reclassified = updatedRows.map(r => ({ ...r, _status: classifyBooking(r, today, rules, classifyCtx) }))
    const nextBatchSet = computeNextBatch(reclassified, today, rules)
    setRows(reclassified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r, classifyCtx) })))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
    setSelected(new Set())
    setShowSave(false)
  }

  // Replace the in-memory table with rows parsed from an uploaded CSV file.
  // Nothing is pushed to GitHub until the user hits Save.
  async function handleImport(importedRaw, mode = 'replace', { adoptPath = null } = {}) {
    // "Use this file as my CSV from now on": point storage at it and hand Save a
    // fresh adapter for that path, so the very next Save writes the imported
    // table back to the file it came from.
    // Multi-band mode reads its band files, not one CSV, so there is nothing to adopt.
    if (adoptPath && !multiBand) {
      setMissingFile(null)
      const saved = await persist({ ...settings, storage: { ...settings.storage, adapter: 'file', filePath: adoptPath } })
      setAdapter(getAdapter(saved))
    }
    if (mode === 'add') {
      appendImported(rows, importedRaw, multiBand)
      return
    }
    // replace
    const classified = linkVenues(importedRaw.map((r, i) => ({ ...r, _idx: i, _status: classifyBooking(r, today, rules, classifyCtx) })), multiBand)
    const nextBatchSet = computeNextBatch(classified, today, rules)
    setRows(classified.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r, classifyCtx) })))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
  }

  // The venue, with every band it has.
  // Append imported rows as new venues with fresh _idx past the current max,
  // keeping existing rows and any unsaved edits/deletions. Tracked in
  // `additions` so they show in — and enable — the Save flow. `baseRows` and
  // `multi` are explicit because a caller may have just reloaded or switched
  // multi-band mode on, which this render's state does not know yet.
  // → the number of venues added.
  function appendImported(baseRows, importedRaw, multi) {
    const nextIdx = baseRows.reduce((max, r) => Math.max(max, r._idx), -1) + 1
    const appended = importedRaw.map((r, i) => ({ ...r, _idx: nextIdx + i }))
    const merged = linkVenues([...baseRows, ...appended], multi).map(r => ({ ...r, _status: classifyBooking(r, today, rules, classifyCtx) }))
    const nextBatchSet = computeNextBatch(merged, today, rules)
    setRows(merged.map(r => ({ ...r, _nextBatch: nextBatchSet.has(r._idx), _missingSeverity: getMissingSeverity(r, classifyCtx) })))
    setAdditions(prev => new Set([...prev, ...appended.map(r => r._idx)]))
    return appended.length
  }

  function handleDelete(rowIndex) {
    const row = rows.find(r => r._idx === rowIndex)
    const all = rows.filter(r => r._venueId === row?._venueId).map(r => r._idx)
    setDeletions(prev => new Set([...prev, rowIndex, ...all]))
    setVenueDetail(null)
  }

  // Multi-band mode: book this venue for another band too. A venue that has no
  // band yet just gets one; otherwise a new entry starts with the venue's shared
  // data and nothing else. → the _idx to show.
  function handleAddBand(rowIndex, bandName) {
    const row = rows.find(r => r._idx === rowIndex)
    if (!row || !bandName) return rowIndex
    const effective = { ...row, ...(edits[rowIndex] || {}) }
    if (!effective['Band']) { handleEdit(rowIndex, 'Band', bandName); return rowIndex }
    const taken = rows.some(r => r._venueId === row._venueId && !deletions.has(r._idx)
      && (edits[r._idx]?.['Band'] ?? r['Band']) === bandName)
    if (taken) return rowIndex

    const newIdx = rows.reduce((max, r) => Math.max(max, r._idx), -1) + 1
    const band = (settings?.bands || []).find(b => b.name === bandName)
    const entry = {
      ...Object.fromEntries(APP_COLUMNS.map(c => [c.key, ''])),
      ...Object.fromEntries(SHARED_FIELDS.map(f => [f, effective[f] || ''])),
      Band: bandName,
      Dates: band?.tourDates || '',
      _idx: newIdx,
      _venueId: row._venueId,
    }
    const classifiedEntry = { ...entry, _status: classifyBooking(entry, today, rules, classifyCtx), _nextBatch: false, _missingSeverity: getMissingSeverity(entry, classifyCtx) }
    setRows(prev => [...prev, classifiedEntry])
    setAdditions(prev => new Set([...prev, newIdx]))
    return newIdx
  }

  // Multi-band mode: stop booking this venue for one band. The venue itself
  // stays — its last band is cleared rather than deleted, which moves it to the
  // unassigned file. → the _idx to show next.
  function handleRemoveBand(rowIndex) {
    const row = rows.find(r => r._idx === rowIndex)
    const others = rows.filter(r => r._venueId === row?._venueId && r._idx !== rowIndex && !deletions.has(r._idx))
    if (!others.length) { handleEdit(rowIndex, 'Band', ''); return rowIndex }
    setDeletions(prev => new Set([...prev, rowIndex]))
    return others[0]._idx
  }

  // --- Bulk (multi-venue) edit -----------------------------------------------
  // Rows are picked in the table (click, shift-click, drag — see useDragSelect).

  // Select or clear all currently-filtered rows at once (header checkbox).
  function toggleAllSelect(idxs, checked) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) idxs.forEach(i => next.add(i))
      else idxs.forEach(i => next.delete(i))
      return next
    })
  }

  // Apply one field/value to every selected row as normal unsaved edits.
  function handleBulkEdit(field, value) {
    selected.forEach(idx => handleEdit(idx, field, value))
  }

  function handleBulkDelete() {
    setDeletions(prev => new Set([...prev, ...selected]))
    setSelected(new Set())
  }

  function exitSelect() {
    setSelected(new Set())
    setSelectMode(false)
  }

  function handleDiscard() {
    // Drop imported (not-yet-saved) rows along with edits and deletions.
    if (additions.size) setRows(prev => prev.filter(r => !additions.has(r._idx)))
    setEdits({})
    setDeletions(new Set())
    setAdditions(new Set())
    setSelected(new Set())
    setConfirmDiscard(false)
  }

  // One line of the save dialog taken back: a deletion kept, an added venue
  // left out, or a field put back to what was loaded.
  function revertChange(c) {
    if (c.isDelete) {
      setDeletions(prev => { const next = new Set(prev); next.delete(c.idx); return next })
    } else if (c.isAdd) {
      setRows(prev => prev.filter(r => r._idx !== c.idx))
      setAdditions(prev => { const next = new Set(prev); next.delete(c.idx); return next })
      setEdits(prev => { const next = { ...prev }; delete next[c.idx]; return next })
    } else {
      applyEdits([[c.idx, c.field, rows.find(r => r._idx === c.idx)?.[c.field] ?? '']])
    }
  }

  function handleNewVenue() {
    // Past the highest _idx, not rows.length: indices have gaps after deletions,
    // and reusing one would make two rows share their edits.
    const newIdx = rows.reduce((max, r) => Math.max(max, r._idx), -1) + 1
    const emptyRow = {
      // Every app column, so a venue added to an empty CSV still writes the
      // full header (the CSV's columns come from its first row).
      ...Object.fromEntries(APP_COLUMNS.map(c => [c.key, ''])),
      _idx: newIdx,
      _venueId: `new${newIdx}`,
      _status: classifyBooking({}, today, rules, classifyCtx),
      _nextBatch: false,
      _missingSeverity: getMissingSeverity({}, classifyCtx),
    }
    setRows(prev => [...prev, emptyRow])
    setVenueDetail(newIdx)
  }

  const editCount = Object.values(edits).reduce((sum, f) => sum + Object.keys(f).length, 0) + deletions.size + additions.size
  // One entry per venue: a venue's own band entries are the same venue, not
  // duplicates of each other. Results are keyed by that entry's _idx, so
  // `venueRep` maps every entry to it.
  const venueRep = useMemo(() => {
    const out = new Map()
    for (const r of rows) if (!out.has(r._venueId)) out.set(r._venueId, r._idx)
    return out
  }, [rows])
  const { dups: duplicateSet, partners: duplicatePartners } = useMemo(
    () => computeDuplicates(rows.filter(r => venueRep.get(r._venueId) === r._idx), dismissed),
    [rows, venueRep, dismissed],
  )
  const venueCount = venueRep.size
  const bandOptions = useMemo(() => effectiveBandOptions(rows, settings?.bands), [rows, settings])
  const typeOptions = useMemo(() => effectiveTypeOptions(rows, settings?.venueTypes), [rows, settings])

  // "+ Add new…" in a Type dropdown: ask for the name, remember it in settings so
  // it is offered everywhere from now on, and hand it back to the cell to commit.
  async function handleAddType() {
    const name = (await ask({
      label: 'New venue type',
      placeholder: 'club',
      hint: 'Only "festival", "filler" and "dead" change how a venue is classified; anything else is just a label.',
      confirmLabel: 'Add',
    }))?.trim()
    if (!name) return null
    const known = settings?.venueTypes || []
    if (!known.some(t => t.toLowerCase() === name.toLowerCase())) {
      await persist({ ...settings, venueTypes: [...known, name] })
    }
    return name
  }

  // Settings ▸ the chips above the list (Filter / Chips ▸ Chips / saved filters).
  const filterChips = useMemo(() => normalizeFilterChips(settings?.filterChips), [settings])
  function handleChipsChange(next) {
    persist({ ...settings, filterChips: next }).catch(e => setError(e.message))
  }

  function handleDismiss(r1, r2) {
    const next = dismissPair(dismissed, r1, r2)
    setDismissed(next)
    persist({ ...settings, dismissedDupes: [...next] }).catch(() => {})
  }

  function handleOpenMerge(partner) {
    const current = rows.find(r => r._idx === venueDetail)
    if (current) setMergeTarget({ rowA: current, rowB: partner })
  }

  function handleMerge(keepIdx, deleteIdx, mergedFields) {
    const keepRow = rows.find(r => r._idx === keepIdx)
    const deleteRow = rows.find(r => r._idx === deleteIdx)
    Object.entries(mergedFields).forEach(([field, value]) => {
      if ((keepRow?.[field] ?? '') !== value) handleEdit(keepIdx, field, value)
    })
    // Multi-band mode: the merged-away venue's other bands come along — same
    // venue data as the one kept, and grouped under it from now on.
    if (multiBand && deleteRow) {
      const movers = rows.filter(r => r._venueId === deleteRow._venueId && r._idx !== deleteIdx && !deletions.has(r._idx))
      if (movers.length) {
        applyEdits(movers.flatMap(r => SHARED_FIELDS
          .filter(f => f in mergedFields)
          .map(f => [r._idx, f, mergedFields[f]])))
        const moving = new Set(movers.map(r => r._idx))
        setRows(prev => prev.map(r => (moving.has(r._idx) ? { ...r, _venueId: keepRow._venueId } : r)))
      }
    }
    setDeletions(prev => new Set([...prev, deleteIdx]))
    setMergeTarget(null)
    setVenueDetail(null)
  }

  const isDuplicate = useCallback(r => duplicateSet.has(venueRep.get(r._venueId)), [duplicateSet, venueRep])
  const liveRows = useMemo(() => rows.filter(r => !deletions.has(r._idx)), [rows, deletions])
  const filteredRows = useMemo(
    () => liveRows.filter(r => matchesFilters(r, filters, { isDuplicate, classify: classifyCtx })),
    [liveRows, filters, isDuplicate, classifyCtx],
  )

  // Venues whose Dates have fallen out of step with their band's Dates —
  // judged on what the table shows, so a fix (or any edit) clears it at once.
  const dateGaps = useMemo(
    () => bandDateGaps(rows.filter(r => !deletions.has(r._idx)).map(r => ({ ...r, ...(edits[r._idx] || {}) })), settings?.bands, settings?.keptVenueDates),
    [rows, edits, deletions, settings],
  )
  // "Keep" on one venue: it stays on its own dates.
  function keepVenueDates(gap) {
    persist({ ...settings, keptVenueDates: [...(settings.keptVenueDates || []), keepKey(gap)] })
  }
  const dateGapsKey = gapsKey(dateGaps)
  const [dismissedDateGaps, setDismissedDateGaps] = useState(() => {
    try { return localStorage.getItem('dismissedBandDates') } catch { return null }
  })
  function dismissDateGaps() {
    try { localStorage.setItem('dismissedBandDates', dateGapsKey) } catch { /* storage unavailable */ }
    setDismissedDateGaps(dateGapsKey)
  }

  const filteredVenueCount = useMemo(() => new Set(filteredRows.map(r => r._venueId)).size, [filteredRows])

  // Sorting runs through the table itself, so the sorted column stays visible
  // (BookingTable injects it as an extra column when it isn't a default one).
  const tableSortBy = filters.sort?.field
    ? [{ id: filters.sort.field, desc: filters.sort.dir === 'desc' }]
    : filters.missingInfo
      ? [{ id: '_missingSeverity', desc: true }]
      : [{ id: '_status', desc: false }]

  // Settings haven't arrived yet — nothing sensible to draw.
  if (!settings) return <div className="min-h-screen bg-gray-50 dark:bg-gray-900" />

  // No storage configured yet, or the configured file has disappeared: point
  // the user at a CSV before anything else.
  if (!isStorageConfigured(settings) || missingFile !== null || needsToken) {
    return (
      <>
        <FirstRun
          settings={settings}
          missingPath={missingFile}
          onConfigured={async storage => {
            const saved = await persist({ ...settings, storage: { ...settings.storage, ...storage } })
            await load(saved)
          }}
          onNeedsMapping={seed => setImportSeed(seed)}
        />
        {importSeed && (
          <ImportWizard
            rows={[]}
            preloaded={importSeed}
            // There is no CSV yet, so the file being mapped has to become one —
            // otherwise the import would fill a table with nowhere to save to.
            onImport={(mapped, mode, opts = {}) =>
              handleImport(mapped, mode, { ...opts, adoptPath: opts.adoptPath || importSeed.path })}
            onClose={() => setImportSeed(null)}
          />
        )}
      </>
    )
  }

  const iconBtn = 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40'
  const viewToggleActive = 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
  const viewToggleInactive = 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'

  const GlobeIcon = (
    <svg className="w-[1em] h-[1em] inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
  const SlidersIcon = (
    <svg className="w-[1em] h-[1em] inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="7" x2="10" y2="7"/><circle cx="13" cy="7" r="2.5"/><line x1="15.5" y1="7" x2="21" y2="7"/>
      <line x1="3" y1="12" x2="6" y2="12"/><circle cx="9" cy="12" r="2.5"/><line x1="11.5" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="17" x2="16" y2="17"/><circle cx="19" cy="17" r="2.5"/>
    </svg>
  )

  // Mobile-only: icon-only vertical controls sidebar
  const mobileControls = (
    <div className="flex flex-col gap-0.5 items-stretch">
      <div className="flex flex-col rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-base">
        <button onClick={() => setView('list')} className={`flex items-center justify-center p-2 transition-colors ${view === 'list' ? viewToggleActive : viewToggleInactive}`}>≡</button>
        <button onClick={() => setView('map')} className={`flex items-center justify-center p-2 transition-colors border-t border-gray-200 dark:border-gray-700 ${view === 'map' ? viewToggleActive : viewToggleInactive}`}>{GlobeIcon}</button>
      </div>
      {editCount > 0 && (
        <button onClick={() => setShowSave(true)} className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-2 py-1.5 rounded-md transition-colors">
          Save <span className="bg-amber-400 text-amber-900 font-bold px-1 py-0.5 rounded-full leading-none">{editCount}</span>
        </button>
      )}
      {editCount > 0 && (confirmDiscard ? (
        <div className="flex flex-col rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs overflow-hidden">
          <span className="text-center text-red-700 dark:text-red-400 py-1">Sure?</span>
          <div className="flex border-t border-red-200 dark:border-red-800">
            <button onClick={handleDiscard} className="flex-1 py-1.5 font-semibold text-red-700 dark:text-red-400">Yes</button>
            <button onClick={() => setConfirmDiscard(false)} className="flex-1 py-1.5 text-red-500 border-l border-red-200 dark:border-red-800">No</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirmDiscard(true)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 transition-colors">Discard</button>
      ))}
      <button onClick={() => setShowLogic(true)} className={iconBtn} title="How venues are classified">ⓘ</button>
      <button onClick={refreshAll} disabled={loading || syncing} className={iconBtn}>{loading || syncing ? '…' : '↻'}</button>
      <button onClick={() => setShowSettings(true)} className={iconBtn} title="Settings">{SlidersIcon}</button>
    </div>
  )

  return (
    <RulesProvider rules={rules}>
    <ClassifyProvider value={classifyCtx}>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {promptNode}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[1400] w-[calc(100%-2rem)] max-w-xl space-y-2">
        <UpdateBanner update={update} onDismiss={dismissUpdate} />
        {!loading && dateGapsKey !== dismissedDateGaps && (
          <BandDatesBanner
            gaps={dateGaps}
            onApply={gaps => applyEdits(gaps.map(g => [g.idx, 'Dates', g.want]))}
            onOpenVenue={setVenueDetail}
            onKeep={keepVenueDates}
            onDismiss={dismissDateGaps}
          />
        )}
      </div>
      <div className="max-w-[1700px] mx-auto px-4 py-6 space-y-5">

        {/* Desktop header — original layout */}
        <div className="hidden sm:flex items-start justify-between">
          <div>
            {lastFetched && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {venueCount} venues · fetched {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
              <button onClick={() => setView('list')} className={`px-3 py-1.5 transition-colors ${view === 'list' ? viewToggleActive : viewToggleInactive}`}>≡ List</button>
              <button onClick={() => setView('map')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${view === 'map' ? viewToggleActive : viewToggleInactive}`}>{GlobeIcon} Map</button>
            </div>
            {editCount > 0 && (
              <>
                <button onClick={() => setShowSave(true)} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors">
                  <span>Save</span>
                  <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{editCount}</span>
                </button>
                {confirmDiscard ? (
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-1.5">
                    <span className="text-xs text-red-700 dark:text-red-400">Sure?</span>
                    <button onClick={handleDiscard} className="text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900">Yes</button>
                    <span className="text-red-300">·</span>
                    <button onClick={() => setConfirmDiscard(false)} className="text-xs text-red-500 hover:text-red-700">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDiscard(true)} className="text-sm text-gray-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Discard</button>
                )}
              </>
            )}
            <button onClick={() => setShowLogic(true)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="How venues are classified">ⓘ Logic</button>
            <button onClick={refreshAll} disabled={loading || syncing} title={mailSyncEnabled(settings) ? 'Reload the CSV and check the mail account' : 'Reload the CSV'} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">{loading ? 'Loading…' : syncing ? 'Checking mail…' : '↻'}</button>
            <button onClick={() => setShowSettings(true)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Settings">⚙</button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-sm text-red-700 dark:text-red-400">{error}</div>
        )}

        {policyDrift.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-4 py-3 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">OpenClaw’s hold logic differs from the Rules — update them in ⓘ Logic</p>
              {policyDrift.map((d, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{d}</p>
              ))}
            </div>
            <button onClick={() => setPolicyDrift([])} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 text-lg leading-none shrink-0">&times;</button>
          </div>
        )}

        {syncNote && (
          <div className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
            <span>{syncNote}</span>
            <button onClick={() => setSyncNote('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none shrink-0">&times;</button>
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-12 text-center">Loading booking data…</div>
        )}

        {/* Mobile controls when no data yet */}
        {rows.length === 0 && !loading && !lastFetched && (
          <div className="sm:hidden flex justify-end">{mobileControls}</div>
        )}

        {/* An empty CSV is a perfectly good list — it needs the toolbar most of
            all, since "+ New Venue" lives there. */}
        {(rows.length > 0 || (lastFetched && !loading)) && (
          <>
            {/* Mobile: chips + vertical controls sidebar */}
            <div className="sm:hidden flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <StatsBar
                  rows={liveRows}
                  filters={filters}
                  onChange={setFilters}
                  duplicateCount={duplicateSet.size}
                  isDuplicate={isDuplicate}
                  chips={filterChips}
                />
              </div>
              <div className="shrink-0 pt-0.5">{mobileControls}</div>
            </div>

            {/* Desktop: StatsBar full width */}
            <div className="hidden sm:block">
              <StatsBar
                rows={liveRows}
                filters={filters}
                onChange={setFilters}
                duplicateCount={duplicateSet.size}
                isDuplicate={isDuplicate}
                chips={filterChips}
              />
            </div>

            <FilterBar rows={rows} filters={filters} onChange={setFilters} onNewVenue={handleNewVenue} bandOptions={bandOptions} typeOptions={typeOptions} chips={filterChips} onChipsChange={handleChipsChange} />
            {view === 'list' && (
              <>
                <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-3">
                  <span>Showing {filteredVenueCount} of {venueCount} venues</span>
                  {editCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">{editCount} unsaved edit{editCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {rows.length === 0 ? (
                  <div className="text-sm text-gray-400 dark:text-gray-500 py-12 text-center">
                    No venues yet — add one with <span className="font-medium">+ New Venue</span>, or bring
                    a list in through Settings ▸ Data &amp; storage ▸ Import CSV.
                  </div>
                ) : (
                <BookingTable
                  rows={filteredRows}
                  edits={edits}
                  onEdit={handleEdit}
                  onVenueClick={setVenueDetail}
                  sortBy={tableSortBy}
                  extraField={filters.sort?.field}
                  bandOptions={bandOptions}
                  typeOptions={typeOptions}
                  onAddType={handleAddType}
                  selectMode={selectMode}
                  selected={selected}
                  onSetSelected={setSelected}
                  onToggleAll={toggleAllSelect}
                  templates={templates}
                  languages={settings.languages}
                  settings={settings}
                  onQuickDraft={caps.mail ? handleQuickDraft : null}
                  draftingIdx={draftingIdx}
                  draftResults={draftResults}
                />
                )}
              </>
            )}
            {view === 'map' && (
              <MapView
                filteredRows={filteredRows}
                onVenueClick={setVenueDetail}
                focusRow={mapFocusRow}
              />
            )}
          </>
        )}
      </div>

      {settings && rows.length > 0 && (
        <ActionDock
          selectMode={selectMode}
          selectedCount={selected.size}
          canSelect={view === 'list'}
          onToggleSelect={() => (selectMode ? exitSelect() : setSelectMode(true))}
          onEmail={caps.mail ? () => setShowBulkDraft(true) : null}
        />
      )}

      {selectMode && view === 'list' && (
        <BulkEditBar
          selectedCount={selected.size}
          filteredCount={filteredRows.length}
          bandOptions={bandOptions}
          typeOptions={typeOptions}
          onSelectAllFiltered={() => toggleAllSelect(filteredRows.map(r => r._idx), true)}
          onClear={() => setSelected(new Set())}
          onBulkEdit={handleBulkEdit}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {showSettings && (
        <SettingsPanel
          config={settings}
          rows={rows}
          onOpenImport={() => { setShowSettings(false); setCameFromSettings(true); setShowImport(true) }}
          onOpenTemplates={() => { setShowSettings(false); setCameFromSettings(true); setShowTemplates(true) }}
          onSave={handleSettingsSave}
          onNewCsv={handleNewCsv}
          onSetMultiBand={handleSetMultiBand}
          onOpenBandFiles={handleOpenBandFiles}
          onRelocateBandFiles={handleRelocateBandFiles}
          onForgetBandFiles={handleForgetBandFiles}
          onNewBandSet={handleNewBandSet}
          onImportBandFiles={handleImportBandFiles}
          unsavedEdits={editCount}
          onPersist={form => persist({ ...settings, ...form })}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showTemplates && caps.mail && (
        <Suspense fallback={null}>
        <TemplatesManager
          settings={settings}
          rows={rows}
          onBack={cameFromSettings ? () => { setShowTemplates(false); setCameFromSettings(false); setShowSettings(true); refreshTemplates() } : null}
          onClose={() => { setShowTemplates(false); setCameFromSettings(false); refreshTemplates() }}
        />
        </Suspense>
      )}
      {showBulkDraft && caps.mail && (
        <Suspense fallback={null}>
        <BulkDraftModal
          rows={rows}
          filteredRows={filteredRows}
          selected={selectMode ? selected : null}
          templates={templates}
          languages={settings.languages}
          settings={settings}
          onDraftCreated={recordDraft}
          onSent={recordSend}
          onClearDraftFlags={clearDraftFlags}
          onClose={() => setShowBulkDraft(false)}
        />
        </Suspense>
      )}
      {showImport && (
        <ImportWizard
          rows={rows}
          multiBand={multiBand}
          onImport={handleImport}
          onBack={cameFromSettings ? () => { setShowImport(false); setCameFromSettings(false); setShowSettings(true) } : null}
          onClose={() => { setShowImport(false); setCameFromSettings(false) }}
        />
      )}
      {showSave && <SaveModal rows={rows} edits={edits} deletions={deletions} additions={additions} adapter={adapter} onSuccess={handleSaveSuccess} onClose={() => setShowSave(false)} onEdit={handleEdit} onRevert={revertChange} onDiscard={handleDiscard} />}
      {mergeTarget && (
        <MergeModal
          rowA={mergeTarget.rowA}
          rowB={mergeTarget.rowB}
          editsA={edits}
          editsB={edits}
          onMerge={handleMerge}
          onClose={() => setMergeTarget(null)}
        />
      )}
      {showLogic && (
        <LogicModal
          onSaveRules={handleRulesSave}
          onClose={() => setShowLogic(false)}
        />
      )}
      {venueDetail !== null && rows.find(r => r._idx === venueDetail) && (
        // A crash inside the dialog closes only the dialog: the table and every
        // unsaved edit stay. Keyed by venue so opening another one starts clean.
        <ErrorBoundary
          key={venueDetail}
          fallback={({ error }) => (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-end z-[1100]" onClick={() => setVenueDetail(null)}>
              <div className="bg-white dark:bg-gray-800 h-full w-full max-w-2xl shadow-2xl p-6 space-y-3" onClick={e => e.stopPropagation()}>
                <p className="font-semibold text-red-700 dark:text-red-400">This venue view ran into an error.</p>
                <p className="font-mono text-xs break-words bg-red-50 dark:bg-red-900/20 rounded p-2 text-red-700 dark:text-red-300">{String(error?.message || error)}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Your unsaved edits are still there — close this and Save as usual.</p>
                <button onClick={() => setVenueDetail(null)} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700">Close</button>
              </div>
            </div>
          )}
        >
        <VenueDetailModal
          rowIndex={venueDetail}
          row={rows.find(r => r._idx === venueDetail)}
          edits={edits}
          onEdit={handleEdit}
          onClose={() => setVenueDetail(null)}
          onDelete={handleDelete}
          onSave={() => setShowSave(true)}
          editCount={editCount}
          duplicatePartners={duplicatePartners[venueRep.get(rows.find(r => r._idx === venueDetail)?._venueId)] || []}
          multiBand={multiBand}
          entries={rows.filter(r => r._venueId === rows.find(x => x._idx === venueDetail)?._venueId && !deletions.has(r._idx))}
          onSelectEntry={setVenueDetail}
          onAddBand={band => setVenueDetail(handleAddBand(venueDetail, band))}
          onRemoveBand={() => setVenueDetail(handleRemoveBand(venueDetail))}
          onDismissDuplicate={handleDismiss}
          onOpenMerge={handleOpenMerge}
          bandOptions={bandOptions}
          typeOptions={typeOptions}
          onAddType={handleAddType}
          templates={templates}
          languages={settings.languages}
          settings={settings}
          draftedAtIso={draftedAt(settings, rows.find(r => r._idx === venueDetail) || {})}
          onDraftCreated={recordDraft}
          onSent={recordSend}
          onOpenMap={() => {
            const row = rows.find(r => r._idx === venueDetail)
            setMapFocusRow(row)
            setVenueDetail(null)
            setView('map')
          }}
        />
        </ErrorBoundary>
      )}
    </div>
    </ClassifyProvider>
    </RulesProvider>
  )
}
