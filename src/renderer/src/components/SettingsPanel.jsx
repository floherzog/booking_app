import { useState, useEffect } from 'react'
import { getStoredTheme, setTheme } from '../lib/theme'
import { exportCsv } from '../lib/csvFile'
import { validateRules, mergeRules } from '@core/rules'
import RulesEditor from './RulesEditor'
import { LogicFlow } from './LogicModal'
import { normalizeBands } from '@core/bands'
import { datesSuggestions } from '@core/bandDates'
import { typesWith, setTypeRule, typeRuleFor, bandBooksType, typeUsage, TYPE_BEHAVIOURS, DEFAULT_TYPE_RULES } from '@core/venueTypes'
import {
  normalizeAccounts, accountLabel, nextAccountId, secretKeyFor,
  defaultSmtpHost, ACCOUNT_DEFAULTS,
} from '@core/mailAccounts'
import LanguagesEditor from './LanguagesEditor'
import { mergeRows } from '@core/multiBand'
import { planSplit, planMerge, planOpenBandFiles, planNewBandSet, planImportBandFiles, planRelocate } from '../lib/multiBandSwitch'
import { useEscape } from '../lib/useEscape'
import BandFilesPlan from './BandFilesPlan'
import { api, caps } from '../platform'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
]

// Languages only pick a template's language, so they go with the mail sections.
const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'storage', label: 'Data & storage' },
  { id: 'rules', label: 'Rules' },
  { id: 'bands', label: 'Bands' },
  { id: 'venueTypes', label: 'Venue types' },
  { id: 'languages', label: 'Languages', needs: 'mail' },
  { id: 'templates', label: 'Mail templates', needs: 'mail' },
  { id: 'mail', label: 'Mail settings', needs: 'mail' },
].filter(s => !s.needs || caps[s.needs])

export default function SettingsPanel({ config, rows = [], onOpenImport, onOpenTemplates, onSave, onNewCsv, onSetMultiBand, onOpenBandFiles, onRelocateBandFiles, onForgetBandFiles, onNewBandSet, onImportBandFiles, unsavedEdits = 0, onPersist, onClose }) {
  const [form, setForm] = useState(config)
  const [section, setSection] = useState('general')
  const [rulesView, setRulesView] = useState('numbers')
  // Theme stays a per-Mac preference in localStorage (see the note in the
  // General section) and applies immediately rather than on Save.
  const [theme, setThemeState] = useState(getStoredTheme)
  const [newBand, setNewBand] = useState('')
  const [newType, setNewType] = useState('')
  const [version, setVersion] = useState('')
  const [articleState, setArticleState] = useState(null)
  const [updateState, setUpdateState] = useState(null) // { checking } | result
  const [githubToken, setGithubToken] = useState('')
  const [hasGithubToken, setHasGithubToken] = useState(false)
  // Typed-but-unsaved passwords, keyed by account id; they go to the keychain on
  // Save (or on a test), never into the settings file.
  const [accountPasswords, setAccountPasswords] = useState({})
  const [hasPassword, setHasPassword] = useState({})
  const [openAccount, setOpenAccount] = useState(null)
  const [accountTests, setAccountTests] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  // "Start a new, empty CSV" asks twice: 0 = not asked, 1 = first "are you
  // sure", 2 = the last one. `wiped` confirms it afterwards.
  const [wipeStep, setWipeStep] = useState(0)
  const [wiping, setWiping] = useState(false)
  const [wiped, setWiped] = useState(false)
  // Multi-band switch: the plan being confirmed ({ on, ... } from planSplit /
  // planMerge), and whether it is running.
  const [mbPlan, setMbPlan] = useState(null)
  const [mbBusy, setMbBusy] = useState(false)
  const [mbError, setMbError] = useState('')
  // Data & storage ▸ Multi-band mode: open / new set / import band files. The
  // plan being confirmed (see BandFilesPlan), and how it went.
  const [bfPlan, setBfPlan] = useState(null)
  const [bfBusy, setBfBusy] = useState(false)
  const [bfError, setBfError] = useState('')
  const [bfDone, setBfDone] = useState('')
  // The band files' folder: whether it still exists, and a move being confirmed.
  const [bandDirGone, setBandDirGone] = useState(false)
  const [relocPlan, setRelocPlan] = useState(null)
  // Settings ▸ Mail settings: the account whose removal is being confirmed.
  const [confirmRemove, setConfirmRemove] = useState(null)
  // Settings ▸ Venue types: a delete being confirmed ({ index, rule, venues }).
  const [typeDelete, setTypeDelete] = useState(null)
  // Escape closes the panel, like ×; an open confirmation is cancelled first.
  useEscape(() => {
    if (typeDelete) setTypeDelete(null)
    else if (confirmRemove) setConfirmRemove(null)
    else onClose()
  })

  // The "Saved" confirmation is the only feedback now that Save no longer
  // closes the panel, so it has to fade on its own.
  useEffect(() => {
    if (!savedAt) return undefined
    const t = setTimeout(() => setSavedAt(0), 2500)
    return () => clearTimeout(t)
  }, [savedAt])

  // Normalised so every band object has the same keys — bare strings and the
  // pre-accounts shape both appear in older settings files.
  const bands = normalizeBands(form.bands)
  const venueTypes = form.venueTypes || []
  const templateOpts = form.templates || {}
  const storage = form.storage || {}
  const mail = form.mail || {}
  const sync = mail.sync || {}
  const accounts = normalizeAccounts(mail)
  const ruleErrors = validateRules(form.rules)
  const storageDirty = JSON.stringify(form.storage) !== JSON.stringify(config.storage)
  // Cheap and good enough: the form is a few kB of plain JSON, and this only
  // drives the footer label.
  const dirty = JSON.stringify(form) !== JSON.stringify(config)
    || !!githubToken.trim() || Object.values(accountPasswords).some(v => v?.trim())

  useEffect(() => {
    api.hasSecret('githubToken').then(setHasGithubToken).catch(() => {})
    normalizeAccounts(config?.mail).forEach(a => {
      api.hasSecret(secretKeyFor(a.id))
        .then(has => setHasPassword(p => ({ ...p, [a.id]: has })))
        .catch(() => {})
    })
    api.getAppVersion().then(setVersion).catch(() => {})
  }, [])

  // The same check the "Check for Updates…" menu item runs; nothing installs
  // itself, the download is a normal .dmg you replace the app with.
  async function checkUpdates() {
    setUpdateState({ checking: true })
    try {
      setUpdateState(await api.checkForUpdates())
    } catch (e) {
      setUpdateState({ error: e.message })
    }
  }

  function handleTheme(value) {
    setThemeState(value)
    setTheme(value)
  }

  // Persisting settings is App's job (one writer for settings.json); the token
  // is the exception — it goes straight to the keychain, never into settings.
  async function handleSave(e) {
    e.preventDefault()
    if (ruleErrors.length) { setSection('rules'); setRulesView('numbers'); return }
    setSaving(true)
    setError('')
    try {
      if (githubToken.trim()) await api.setSecret('githubToken', githubToken.trim())
      await savePasswords()
      const saved = await onSave(form)
      // Saving deliberately leaves the panel open — settings are usually
      // adjusted in batches. Adopt whatever main actually stored so the form
      // stops reading as dirty.
      if (saved) setForm(saved)
      if (githubToken.trim()) { setGithubToken(''); setHasGithubToken(true) }

      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // One account's fields. Accounts are normalised on read, so this writes the
  // full list back rather than patching a possibly-absent array.
  function setAccount(id, patch) {
    setForm(f => ({
      ...f,
      mail: {
        ...f.mail,
        accounts: normalizeAccounts(f.mail).map(a => (a.id === id ? { ...a, ...patch } : a)),
      },
    }))
  }

  function addAccount() {
    const current = normalizeAccounts(form.mail)
    const id = nextAccountId(current)
    setForm(f => ({
      ...f,
      mail: { ...f.mail, accounts: [...normalizeAccounts(f.mail), { ...ACCOUNT_DEFAULTS, id, host: '' }] },
    }))
    setOpenAccount(id)
  }

  // Removing an account also unassigns the bands pointing at it, so no band is
  // left naming a mailbox that no longer exists.
  async function removeAccount(id) {
    setForm(f => ({
      ...f,
      mail: { ...f.mail, accounts: normalizeAccounts(f.mail).filter(a => a.id !== id) },
      bands: normalizeBands(f.bands).map(b => (b.mailAccountId === id ? { ...b, mailAccountId: '' } : b)),
    }))
    setAccountPasswords(p => { const n = { ...p }; delete n[id]; return n })
    try { await api.deleteSecret(secretKeyFor(id)) } catch { /* nothing stored */ }
    setHasPassword(p => ({ ...p, [id]: false }))
    if (openAccount === id) setOpenAccount(null)
  }

  function bandsUsing(id) {
    // The first account is also what every unassigned band uses.
    const isDefault = accounts[0]?.id === id
    return bands.filter(b => b.mailAccountId === id || (isDefault && !b.mailAccountId)).map(b => b.name).filter(Boolean)
  }

  // Passwords go to the keychain, never into settings.json.
  async function savePasswords() {
    for (const [id, value] of Object.entries(accountPasswords)) {
      if (!value?.trim()) continue
      await api.setSecret(secretKeyFor(id), value.trim())
      setHasPassword(p => ({ ...p, [id]: true }))
    }
    setAccountPasswords({})
  }

  // Ask the on-device model helper what state it is in, but only when the pane
  // that shows it is actually open.
  useEffect(() => {
    if (section !== 'templates' || articleState) return
    let alive = true
    api.articleAvailability()
      .then(r => { if (alive) setArticleState(r || { ok: false, status: 'failed' }) })
      .catch(() => { if (alive) setArticleState({ ok: false, status: 'failed', error: 'Could not reach the language helper.' }) })
    return () => { alive = false }
  }, [section, articleState])

  function setSync(patch) {
    setForm(f => ({ ...f, mail: { ...f.mail, sync: { ...f.mail?.sync, ...patch } } }))
  }

  // A test has to run against what is on screen, so the password is written to
  // the keychain and the settings persisted before anything connects.
  async function testAccount(id, kind) {
    setAccountTests(t => ({ ...t, [id]: { busy: kind } }))
    try {
      await savePasswords()
      // Persist without the band-propagation prompts a full Save runs.
      await onPersist(form)

      if (kind === 'imap') {
        const { mailboxes: boxes, suggestion, sentSuggestion } = await api.testMailConnection(id)
        const account = normalizeAccounts(form.mail).find(a => a.id === id)
        if (!account?.draftsMailbox && suggestion) setAccount(id, { draftsMailbox: suggestion })
        if (!account?.sentMailbox && sentSuggestion) setAccount(id, { sentMailbox: sentSuggestion })
        const sent = account?.sentMailbox || sentSuggestion
        setAccountTests(t => ({
          ...t,
          [id]: {
            ok: true,
            message: `Connected — ${boxes.length} mailboxes. Drafts: ${account?.draftsMailbox || suggestion}. Sent: ${sent || 'not found — name it above, or sent mail is not copied there'}`,
          },
        }))
        return
      }

      const r = await api.verifySmtp(id)
      setAccountTests(t => ({
        ...t,
        [id]: r.ok
          ? { ok: true, message: `Sending works — ${r.host}:${r.port} over ${r.encryption}${r.derived ? ' (server worked out from the IMAP host)' : ''}.` }
          : { ok: false, message: r.error },
      }))
    } catch (e) {
      setAccountTests(t => ({ ...t, [id]: { ok: false, message: e.message } }))
    }
  }

  function setStorage(patch) {
    setForm(f => ({ ...f, storage: { ...f.storage, ...patch } }))
  }

  async function chooseFile() {
    const picked = await api.pickCsvOpen()
    if (picked) setStorage({ filePath: picked })
  }

  async function forgetToken() {
    await api.deleteSecret('githubToken')
    setHasGithubToken(false)
    setGithubToken('')
  }

  // In multi-band mode this is the merged list — the same single CSV switching
  // the mode off would write.
  function handleExport() {
    exportCsv(mergeRows(rows)).catch(() => { /* the user cancelled the save dialog */ })
  }

  const multiBandOn = !!config.storage?.multiBand?.enabled
  // Web build: a token baked in by the deploy needs no field to type one into.
  const builtInToken = !!api.githubTokenBuiltIn?.()
  // Why the switch can't be flipped right now, if it can't.
  const mbBlocked = config.storage?.adapter === 'github' && !multiBandOn
    ? 'Only available with a local CSV file — GitHub storage keeps one file.'
    : storageDirty ? 'Save the storage change first.'
      : unsavedEdits > 0 ? `Save or discard your ${unsavedEdits} unsaved venue edit${unsavedEdits !== 1 ? 's' : ''} first.`
        : ''

  async function prepareMultiBand() {
    setMbError('')
    setMbBusy(true)
    try {
      setMbPlan(multiBandOn
        ? { on: false, ...(await planMerge(config, rows)) }
        : { on: true, ...(await planSplit(config)) })
    } catch (e) {
      setMbError(e.message)
    } finally {
      setMbBusy(false)
    }
  }

  // Pick the file(s), then show what would happen. Nothing changes until the
  // plan is confirmed.
  async function prepareBandFiles(kind, fromPath = null) {
    setBfError('')
    setBfDone('')
    setBfPlan(null)
    try {
      let plan = null
      if (kind === 'open') {
        const picked = fromPath || await api.pickCsvOpen()
        if (picked) plan = await planOpenBandFiles(picked)
      } else if (kind === 'newset') {
        const target = await api.pickCsvSave('booking.csv', 'Name and place for the new band files')
        if (target) plan = await planNewBandSet(config, target)
      } else {
        const paths = await api.pickCsvOpenMany('Choose the band files to import')
        if (paths.length) plan = await planImportBandFiles(paths)
      }
      // Remember the mode as it was when asked: confirming may switch it on, and
      // the box should keep describing what the user agreed to.
      setBfPlan(plan && { ...plan, wasOn: multiBandOn })
    } catch (e) {
      setBfError(e.message)
    }
  }

  async function confirmBandFiles() {
    setBfError('')
    setBfBusy(true)
    try {
      if (bfPlan.kind === 'import') {
        const { saved, added } = await onImportBandFiles(bfPlan)
        setForm(f => ({ ...f, storage: saved.storage }))
        setBfDone(`Added ${added} venue entr${added !== 1 ? 'ies' : 'y'} — close Settings and press Save to write them to the band files.`)
      } else {
        const saved = await (bfPlan.kind === 'open' ? onOpenBandFiles : onNewBandSet)(bfPlan)
        setForm(f => ({ ...f, storage: saved.storage }))
        setBfDone(bfPlan.kind === 'open' ? 'Done — the app now uses these band files.' : 'Done — the new, empty band files are in use.')
      }
    } catch (e) {
      setBfError(e.message)
    } finally {
      setBfBusy(false)
    }
  }

  // Why the band-file actions can't run right now, if they can't.
  const bfBlocked = storageDirty ? 'Save the storage change first.'
    : unsavedEdits > 0 ? `Save or discard your ${unsavedEdits} unsaved venue edit${unsavedEdits !== 1 ? 's' : ''} first.`
      : ''

  const bandDir = config.storage?.multiBand?.enabled ? config.storage.multiBand.dir : ''
  useEffect(() => {
    if (!bandDir) return
    api.fileExists(bandDir).then(ok => setBandDirGone(!ok)).catch(() => {})
  }, [bandDir])

  async function prepareRelocate() {
    setBfError('')
    setBfDone('')
    setRelocPlan(null)
    try {
      const picked = await api.pickFolder('Where are the band files now?', bandDirGone ? undefined : bandDir)
      if (picked) setRelocPlan(await planRelocate(config, picked))
    } catch (e) {
      setBfError(e.message)
    }
  }

  async function confirmRelocate() {
    setBfError('')
    setBfBusy(true)
    try {
      const saved = await onRelocateBandFiles(relocPlan)
      setForm(f => ({ ...f, storage: saved.storage }))
      setRelocPlan(null)
      setBandDirGone(false)
      setBfDone('Done — the app now uses the band files in that folder.')
    } catch (e) {
      setBfError(e.message)
    } finally {
      setBfBusy(false)
    }
  }

  async function forgetBandFiles() {
    setBfError('')
    setBfBusy(true)
    try {
      const saved = await onForgetBandFiles()
      setForm(f => ({ ...f, storage: saved.storage }))
    } catch (e) {
      setBfError(e.message)
    } finally {
      setBfBusy(false)
    }
  }

  async function confirmMultiBand() {
    setMbError('')
    setMbBusy(true)
    try {
      const saved = await onSetMultiBand?.(mbPlan.on)
      // The panel's form still holds the old storage section; a later Save here
      // would otherwise switch the mode straight back.
      if (saved) setForm(f => ({ ...f, storage: saved.storage }))
      setMbPlan(null)
    } catch (e) {
      setMbError(e.message)
    } finally {
      setMbBusy(false)
    }
  }

  async function handleWipe() {
    setWiping(true)
    setError('')
    try {
      await onNewCsv?.()
      setWiped(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setWiping(false)
      setWipeStep(0)
    }
  }

  // --- Venue-type rules --------------------------------------------------------
  const typeRules = form.venueTypeRules || DEFAULT_TYPE_RULES
  const restrictedTypes = typesWith(typeRules, r => r.bands !== null)
  function setTypeRules(next) {
    setForm(f => ({ ...f, venueTypeRules: next }))
  }
  function setBandBooksType(type, band, on) {
    const current = typeRuleFor(typeRules, type).bands || []
    const bandsNext = on ? [...current, band] : current.filter(x => x.toLowerCase() !== band.toLowerCase())
    setTypeRules(setTypeRule(typeRules, type, { bands: bandsNext }))
  }

  // --- Band list -------------------------------------------------------------
  // Bands are objects: { name, tourDates, mailAccountId }.
  function setBands(next) {
    setForm(f => ({ ...f, bands: next }))
  }

  function addBand() {
    const name = newBand.trim()
    if (!name || bands.some(b => b.name === name)) { setNewBand(''); return }
    setBands([...bands, { name, tourDates: '' }]
      .sort((a, c) => a.name.localeCompare(c.name)))
    setNewBand('')
  }

  function updateBand(i, patch) {
    setBands(bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function removeBand(i) {
    setBands(bands.filter((_, idx) => idx !== i))
  }

  // --- Venue types -----------------------------------------------------------
  // A flat list of strings. Removing one never rewrites any venue: a row keeps
  // whatever it says, and the dropdown keeps offering that value (see
  // effectiveTypeOptions).
  function setVenueTypes(next) {
    setForm(f => ({ ...f, venueTypes: next }))
  }

  // A rule follows its type when the type is renamed.
  function renameType(i, value) {
    const from = venueTypes[i]
    setVenueTypes(venueTypes.map((x, idx) => (idx === i ? value : x)))
    if (value.trim() && from.trim() && from.trim().toLowerCase() !== value.trim().toLowerCase()) {
      const rule = typeRuleFor(typeRules, from)
      setTypeRules(setTypeRule(setTypeRule(typeRules, from, { behaves: 'normal', bands: null, frequencyDays: null }), value, rule))
    }
  }

  // Deleting a type that does something, or that venues use, asks first.
  function requestRemoveType(i) {
    const usage = typeUsage(typeRules, venueTypes[i], rows)
    if (usage.rule.length || usage.venues) setTypeDelete({ index: i, ...usage })
    else removeType(i)
  }
  function removeType(i) {
    const t = venueTypes[i]
    setVenueTypes(venueTypes.filter((_, idx) => idx !== i))
    setTypeRules(setTypeRule(typeRules, t, { behaves: 'normal', bands: null, frequencyDays: null }))
    setTypeDelete(null)
  }

  function addVenueType() {
    const name = newType.trim()
    if (!name || venueTypes.some(t => t.toLowerCase() === name.toLowerCase())) { setNewType(''); return }
    setVenueTypes([...venueTypes, name])
    setNewType('')
  }

  function setTemplateOpt(patch) {
    setForm(f => ({ ...f, templates: { ...(f.templates || {}), ...patch } }))
  }

  function setVideoOpt(patch) {
    setTemplateOpt({ video: { ...(templateOpts.video || {}), ...patch } })
  }

  function setContactFallback(lang, value) {
    setTemplateOpt({ contactFallbacks: { ...(templateOpts.contactFallbacks || {}), [lang]: value } })
  }

  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const monoInput = `${input} font-mono`
  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
  const outlineBtn = 'py-1.5 px-3 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors'

  return (
    // No backdrop click-to-close: settings hold unsaved edits, and losing them to
    // a stray click outside the panel is not a recoverable mistake.
    // Above the venue view (1100) — the menu can open Settings while a venue is
    // open — and below the pages Settings itself opens (Templates, Import).
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1150] p-4">
      {/* One size for every section — sized to its content, the window jumped
          on every click in the rail. Long sections scroll inside it. */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl h-[90vh] sm:h-[min(90vh,48rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
            {/* Section rail — a scrolling row of tabs on a phone */}
            <nav className="sm:w-40 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-gray-700 py-2 sm:py-3 flex sm:block sm:space-y-0.5 overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 whitespace-nowrap sm:w-full text-left px-4 py-1.5 text-sm transition-colors ${section === s.id
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                >
                  {s.label}
                  {s.id === 'rules' && ruleErrors.length > 0 && (
                    <span className="ml-1.5 text-red-500" title="This section has errors">•</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 sm:px-6 py-5">
              {section === 'general' && (
                <div className="space-y-4">
                  <div>
                    <p className={lbl}>Appearance</p>
                    <div className="flex gap-2">
                      {THEMES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => handleTheme(t.value)}
                          className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors
                            ${theme === t.value
                              ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-gray-800 dark:border-gray-200'
                              : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                            }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {caps.localFiles
                        ? 'Applies straight away and is remembered per Mac, so it isn’t part of the settings file you might sync between machines.'
                        : 'Applies straight away and is remembered in this browser only.'}
                    </p>
                  </div>

                  {caps.multiBand && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Multi-band mode</p>
                    <label className={`flex items-start gap-2 ${mbBlocked || mbBusy ? 'opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={multiBandOn}
                        disabled={!!mbBlocked || mbBusy || !!mbPlan}
                        // The box shows the stored state; flipping it only asks.
                        onChange={prepareMultiBand}
                        className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Book several bands for the same venue
                        <span className="block text-gray-400 dark:text-gray-500">
                          Keeps one CSV per band (plus one for venues without a band) and shows them as one
                          list. Venue details — name, type, city, country, contact, email, website, time
                          frame — stay the same across bands; everything else is per band. Switching off
                          merges them back into one CSV.
                        </span>
                        {mbBlocked && <span className="block text-amber-600 dark:text-amber-400 mt-1">{mbBlocked}</span>}
                      </span>
                    </label>

                    {mbPlan && (
                      <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2 text-xs text-amber-800 dark:text-amber-300">
                        {mbPlan.on ? (
                          <>
                            <p className="font-semibold">This adds {mbPlan.files.length} files next to your CSV:</p>
                            <p className="font-mono break-all text-amber-700 dark:text-amber-400">{mbPlan.dir}</p>
                            <ul className="space-y-0.5">
                              {mbPlan.files.map(f => (
                                <li key={f.path} className="flex justify-between gap-3">
                                  <span className="font-mono truncate">{f.name}</span>
                                  <span className="shrink-0">{f.count} venue{f.count !== 1 ? 's' : ''}{f.band ? '' : ' without a band'}</span>
                                </li>
                              ))}
                            </ul>
                            <p>
                              Your current CSV, <span className="font-mono">{mbPlan.source}</span>, is renamed to{' '}
                              <span className="font-mono">{mbPlan.backup}</span> and no longer used.{' '}
                              <span className="font-semibold">The booking scripts and the web app only know the single
                              CSV</span> — they won’t see anything you change while this mode is on.
                            </p>
                            {mbPlan.clashes.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-red-700 dark:text-red-400 font-medium">
                                  Band files are already in that folder: {mbPlan.clashes.join(', ')}.
                                </p>
                                {mbPlan.files.some(f => mbPlan.clashes.includes(f.name)) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const existing = mbPlan.files.find(f => mbPlan.clashes.includes(f.name))
                                      setMbPlan(null)
                                      setSection('storage')
                                      prepareBandFiles('open', existing.path)
                                    }}
                                    className="font-semibold underline hover:no-underline"
                                  >
                                    Use the existing band files instead…
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="font-semibold">Merge the band files back into one CSV?</p>
                            <p>
                              Writes <span className="font-mono">{mbPlan.targetName}</span> with {mbPlan.lines} line{mbPlan.lines !== 1 ? 's' : ''} for {mbPlan.venues} venue{mbPlan.venues !== 1 ? 's' : ''} —
                              a venue booked for several bands gets one line per band. The band files move into the
                              folder <span className="font-mono">{mbPlan.backupName}</span>.
                            </p>
                          </>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={confirmMultiBand}
                            disabled={mbBusy || (mbPlan.on && mbPlan.clashes.length > 0)}
                            className="bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
                          >
                            {mbBusy ? 'Working…' : mbPlan.on ? 'Split into band files' : 'Merge into one CSV'}
                          </button>
                          <button type="button" onClick={() => setMbPlan(null)} disabled={mbBusy} className={outlineBtn}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {mbError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{mbError}</p>}
                  </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Version</p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-800 dark:text-gray-200 font-mono">{version || '…'}</span>
                      {caps.updates && (
                        <button type="button" onClick={checkUpdates} disabled={updateState?.checking} className={outlineBtn}>
                          {updateState?.checking ? 'Checking…' : 'Check for updates'}
                        </button>
                      )}
                    </div>
                    {updateState && !updateState.checking && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {updateState.error ? updateState.error
                          : updateState.newer ? (
                            <>
                              Version <span className="font-mono">{updateState.latest}</span> is available.{' '}
                              <button
                                type="button"
                                // The .dmg for this Mac when the release has one: the
                                // browser downloads it straight away.
                                onClick={() => api.openExternal(updateState.downloadUrl || updateState.url)}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                Download it
                              </button>
                              {updateState.downloadUrl ? ' (saves the .dmg to Downloads)' : ''}, then drag it into Applications over the old copy.
                            </>
                          ) : 'You are running the latest published version.'}
                      </p>
                    )}
                    {caps.updates && (
                    <label className="mt-3 flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!form.general?.autoCheckUpdates}
                        onChange={e => setForm(f => ({ ...f, general: { ...f.general, autoCheckUpdates: e.target.checked } }))}
                        className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Check automatically when the app starts
                        <span className="block text-gray-400 dark:text-gray-500">
                          Only says something when a newer release exists — silent when you are up to date or offline.
                        </span>
                      </span>
                    </label>
                    )}
                    {!caps.updates && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        The web app updates itself: every change to the app is deployed here automatically.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {section === 'rules' && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {rulesView === 'flow'
                        ? 'How a venue gets its status: the first gate that matches wins, the trunk continues on "no". Drawn from the numbers as they stand here.'
                        : 'The numbers behind the statuses. Change one and the flow follows; Save applies them.'}
                    </p>
                    <div className="flex gap-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-0.5 shrink-0">
                      {[['numbers', 'Numbers'], ['flow', 'Flow']].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setRulesView(id)}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${rulesView === id
                            ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {rulesView === 'flow'
                    ? (
                      <LogicFlow
                        rules={mergeRules(form.rules)}
                        typeRules={typeRules}
                        venueTypes={venueTypes}
                        bandNames={bands.map(b => b.name).filter(Boolean)}
                        onTypeRulesChange={setTypeRules}
                      />
                    )
                    : <RulesEditor rules={form.rules} onChange={next => setForm(f => ({ ...f, rules: next }))} />}
                </div>
              )}

              {section === 'venueTypes' && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    The values offered in a venue’s Type dropdown, and what each one does. A type can be
                    <span className="font-medium"> never contacted</span> (like “dead”), contacted only while its
                    <span className="font-medium"> festival window</span> is open, booked by <span className="font-medium">only some
                    bands</span> (like “filler”), and have its own follow-up interval. A type with none of these is just a label.
                    The same choices appear as dropdowns in Rules ▸ Flow.
                  </p>

                  {venueTypes.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No types yet.</p>
                  )}

                  <div className="space-y-2">
                    {venueTypes.map((t, i) => (
                      <TypeRuleRow
                        key={i}
                        type={t}
                        rule={typeRuleFor(typeRules, t)}
                        bandNames={bands.map(b => b.name).filter(Boolean)}
                        input={input}
                        onRename={value => renameType(i, value)}
                        onRule={patch => setTypeRules(setTypeRule(typeRules, t, patch))}
                        onRemove={() => requestRemoveType(i)}
                        confirming={typeDelete?.index === i ? typeDelete : null}
                        onConfirmRemove={() => removeType(i)}
                        onCancelRemove={() => setTypeDelete(null)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      className={input}
                      value={newType}
                      placeholder="Add a type…"
                      onChange={e => setNewType(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVenueType() } }}
                    />
                    <button type="button" onClick={addVenueType} className={outlineBtn}>Add</button>
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Removing a type here never changes a venue — rows keep what they say, and their value stays
                    selectable in the dropdown. They just stop being treated specially.
                  </p>
                </div>
              )}

              {section === 'storage' && (
                <div className="space-y-4">
                  {caps.storageChoice && (
                  <div className="space-y-2">
                    {[
                      { value: 'file', label: 'Local CSV file', hint: 'Anywhere on this Mac — iCloud Drive keeps it in sync.' },
                      { value: 'github', label: 'GitHub repository', hint: 'Shares one list with the web app and the booking script.' },
                    ].map(o => (
                      <label key={o.value} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="storage-adapter"
                          className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-400"
                          checked={storage.adapter === o.value}
                          // Multi-band mode is local files only; switch it off first.
                          disabled={multiBandOn && o.value === 'github'}
                          onChange={() => setStorage({ adapter: o.value })}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                          <span className="block text-xs text-gray-400 dark:text-gray-500">{o.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  )}

                  {storage.adapter === 'github' ? (
                    <div className="space-y-3">
                      <div>
                        <label className={lbl}>Repository (owner/name)</label>
                        <input className={monoInput} value={storage.github?.repo || ''} placeholder="you/booking_list"
                          onChange={e => setStorage({ github: { ...storage.github, repo: e.target.value } })} />
                      </div>
                      <div>
                        <label className={lbl}>File path in the repo</label>
                        <input className={monoInput} value={storage.github?.path || ''} placeholder="data/booking.csv"
                          onChange={e => setStorage({ github: { ...storage.github, path: e.target.value } })} />
                      </div>
                      {!builtInToken && (
                      <div>
                        <label className={lbl}>Personal access token (repo scope)</label>
                        <input
                          type="password"
                          className={monoInput}
                          value={githubToken}
                          onChange={e => setGithubToken(e.target.value)}
                          placeholder={hasGithubToken ? '•••••••• (stored — type to replace)' : 'ghp_…'}
                        />
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {caps.localFiles ? 'Kept in your macOS keychain, never in the settings file.' : 'Kept in this browser, never in the settings.'}
                          </p>
                          {hasGithubToken && (
                            <button type="button" onClick={forgetToken} className="shrink-0 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 underline">
                              Forget token
                            </button>
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  ) : (
                    multiBandOn ? (
                    <div>
                      <label className={lbl}>Band files folder</label>
                      <div className="flex gap-2 items-center">
                        <input className={`${monoInput} flex-1`} value={bandDir} readOnly />
                        <button type="button" onClick={prepareRelocate} disabled={!!bfBlocked || bfBusy} className={`${outlineBtn} shrink-0`}
                          title="Point the app at the folder the band files are in now, or move them to another folder">
                          Choose folder…
                        </button>
                      </div>
                      {bandDirGone ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                          This folder no longer exists — it was moved, renamed or deleted. Choose where the band files are
                          now, or let go of them and go back to a single CSV.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                          Multi-band mode is on: one CSV per band in this folder. Choose another folder to move them there.
                        </p>
                      )}
                      {relocPlan && (
                        <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2 text-xs text-amber-800 dark:text-amber-300">
                          <p className="font-semibold">Use this folder for the band files?</p>
                          <p className="font-mono break-all text-amber-700 dark:text-amber-400">{relocPlan.dir}</p>
                          {relocPlan.found.length > 0 && <p>Already there: {relocPlan.found.join(', ')}.</p>}
                          {relocPlan.toMove.length > 0 && <p>Moved there from the old folder: {relocPlan.toMove.join(', ')}.</p>}
                          {relocPlan.missing.length > 0 && <p>Not found anywhere, so they start empty: {relocPlan.missing.join(', ')}.</p>}
                          {relocPlan.clashes.length > 0 && (
                            <p className="text-red-700 dark:text-red-400 font-medium">In both folders: {relocPlan.clashes.join(', ')}. Move one copy away first.</p>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={confirmRelocate} disabled={bfBusy || relocPlan.clashes.length > 0}
                              className="bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50">
                              {bfBusy ? 'Working…' : relocPlan.toMove.length ? 'Move and use' : 'Use this folder'}
                            </button>
                            <button type="button" onClick={() => setRelocPlan(null)} disabled={bfBusy} className={outlineBtn}>Cancel</button>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {bandDirGone ? (
                          <button type="button" onClick={forgetBandFiles} disabled={!!bfBlocked || bfBusy} className={outlineBtn}
                            title="Multi-band mode off, without merging — there is nothing left to merge">
                            Let go of the band files
                          </button>
                        ) : (
                          <button type="button" disabled={!!mbBlocked || mbBusy}
                            onClick={() => { setSection('general'); prepareMultiBand() }} className={outlineBtn}
                            title="Merge the band files back into one CSV (General ▸ Multi-band mode)">
                            Switch back to a single CSV…
                          </button>
                        )}
                      </div>
                      {bfDone && !bfPlan && <p className="mt-2 text-xs text-green-700 dark:text-green-400">{bfDone}</p>}
                    </div>
                    ) : (
                    <div>
                      <label className={lbl}>CSV file</label>
                      <div className="flex gap-2 items-center">
                        <input className={`${monoInput} flex-1`} value={storage.filePath || ''} readOnly placeholder="No file chosen" />
                        <button type="button" onClick={chooseFile} className={`${outlineBtn} shrink-0`}>Choose…</button>
                      </div>
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        Saving rewrites this file in place. If it lives in iCloud Drive, don’t edit it on two
                        Macs at once — the app warns you if it changed underneath, but it can’t merge.
                      </p>
                    </div>
                    )
                  )}

                  {caps.openclawPolicy && (
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                      <p className={lbl}>OpenClaw script</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
                        Read to warn when its hold keywords or override window differ from the Rules. Leave empty to skip the check.
                      </p>
                      <div>
                        <label className={lbl}>Repository (owner/name)</label>
                        <input className={monoInput} value={form.openclaw?.repo || ''} placeholder="you/openclaw-backup"
                          onChange={e => setForm(f => ({ ...f, openclaw: { ...f.openclaw, repo: e.target.value } }))} />
                      </div>
                      <div>
                        <label className={lbl}>Script path in the repo</label>
                        <input className={monoInput} value={form.openclaw?.path || ''} placeholder="scripts/create_booking_batch.py"
                          onChange={e => setForm(f => ({ ...f, openclaw: { ...f.openclaw, path: e.target.value } }))} />
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Import and export</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleExport} disabled={rows.length === 0} className={`${outlineBtn} flex-1`}>
                        Export CSV
                      </button>
                      <button type="button" onClick={() => onOpenImport?.()} className={`${outlineBtn} flex-1`}>
                        Import CSV…
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      Export {caps.localFiles ? 'writes a copy wherever you point it' : 'downloads a copy'}. Import opens a guided wizard — replace the table
                      or add to it, and match your file's columns to the app's. Changes stay in the app until you
                      press Save.
                    </p>
                  </div>

                  {caps.multiBand && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>
                      Band files
                      <span className="ml-1.5 inline-block rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Multi-band mode</span>
                    </p>
                    <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                      One CSV per band, for booking several bands at the same venue.{' '}
                      {multiBandOn
                        ? 'Multi-band mode is on.'
                        : <>Multi-band mode is off — <span className="font-medium">each of these switches it on</span>, after showing you what it will do.</>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => prepareBandFiles('open')} disabled={!!bfBlocked || bfBusy} className={outlineBtn}
                        title="A set of band files that already exists — from another Mac, or a copy someone sent you">
                        Open band files…
                      </button>
                      <button type="button" onClick={() => prepareBandFiles('import')} disabled={!!bfBlocked || bfBusy || (!multiBandOn && config.storage?.adapter === 'github')} className={outlineBtn}
                        title="Add the venues of several band files to your list">
                        Import band files…
                      </button>
                      <button type="button" onClick={() => prepareBandFiles('newset')} disabled={!!bfBlocked || bfBusy} className={outlineBtn}
                        title="Empty band files in a folder you choose; the current files stay as they are">
                        New set of band files…
                      </button>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                      <li><span className="font-medium text-gray-500 dark:text-gray-400">Open</span> — use a set of band files that already exists, e.g. from your other Mac. Pick any one of them; the rest of the set is found in its folder.</li>
                      <li><span className="font-medium text-gray-500 dark:text-gray-400">Import</span> — add the venues of several band files to your list{multiBandOn ? '' : ' (your current CSV is split into band files first)'}.</li>
                      <li><span className="font-medium text-gray-500 dark:text-gray-400">New set</span> — start over with empty band files somewhere else. Your current files are not touched.</li>
                    </ul>
                    {bfBlocked && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{bfBlocked}</p>}
                    {!multiBandOn && config.storage?.adapter === 'github' && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Import needs a local CSV to split first — Open and New set work from GitHub storage too.</p>
                    )}
                    <BandFilesPlan
                      plan={bfPlan}
                      multiBandOn={bfPlan?.wasOn ?? multiBandOn}
                      busy={bfBusy}
                      done={bfDone}
                      error={bfError}
                      onConfirm={confirmBandFiles}
                      onCancel={() => { setBfPlan(null); setBfError('') }}
                    />
                    {!bfPlan && bfError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{bfError}</p>}
                  </div>
                  )}

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Start over</p>
                    {wipeStep === 0 ? (
                      <button
                        type="button"
                        onClick={() => { setWiped(false); setWipeStep(1) }}
                        // It empties the CSV the app has open — not a path typed
                        // here and not saved yet.
                        disabled={storageDirty}
                        className="disabled:opacity-40 py-1.5 px-3 rounded-md text-sm font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        New, empty CSV…
                      </button>
                    ) : (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 space-y-2">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                          {wipeStep === 1 ? 'ARE YOU SURE?' : 'ARE YOU REALLY SURE? This cannot be undone.'}
                        </p>
                        <p className="text-xs text-red-700 dark:text-red-400">
                          {wipeStep === 1
                            ? <>All {rows.length} venue{rows.length !== 1 ? 's' : ''} will be removed from your booking CSV, along with any unsaved edits. Only the column headers stay. Export a copy first if you might want them back.</>
                            : <>Your booking CSV is overwritten right now — not staged for Save. There is no undo.</>}
                        </p>
                        <div className="flex gap-2">
                          {wipeStep === 1 ? (
                            <button type="button" onClick={() => setWipeStep(2)} className="bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 transition-colors">
                              Yes, continue
                            </button>
                          ) : (
                            <button type="button" onClick={handleWipe} disabled={wiping} className="bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-800 transition-colors disabled:opacity-50">
                              {wiping ? 'Emptying…' : 'Yes, empty it for good'}
                            </button>
                          )}
                          <button type="button" onClick={() => setWipeStep(0)} disabled={wiping} className={outlineBtn}>Cancel</button>
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {storageDirty
                        ? 'Save the storage change first — this empties the CSV the app currently has open.'
                        : wiped
                        ? 'Done — the list is empty. Add venues with + New Venue, or import a CSV.'
                        : multiBandOn
                          ? 'Empties every band file so you can start from a blank list. Settings, bands and templates are kept.'
                          : 'Empties the CSV above so you can start from a blank list. Settings, bands and templates are kept.'}
                    </p>
                  </div>
                </div>
              )}

              {section === 'languages' && (
                <LanguagesEditor languages={form.languages} onChange={languages => setForm(f => ({ ...f, languages }))} />
              )}

              {section === 'bands' && (
                <div>
                  <div className="space-y-2">
                    {bands.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">No bands yet — add one below.</p>
                    )}
                    {bands.map((b, i) => (
                      <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 p-2 space-y-2">
                        <div className="flex gap-2 items-center">
                          <input
                            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                            value={b.name}
                            placeholder="Band name"
                            onChange={e => updateBand(i, { name: e.target.value })}
                          />
                          <button
                            type="button"
                            onClick={() => removeBand(i)}
                            className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded transition-colors"
                            title="Remove band"
                          >
                            &times;
                          </button>
                        </div>
                        <div className="flex gap-2 items-center">
                          <label className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Dates</label>
                          <input
                            type="text"
                            className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                            placeholder="e.g. Jun–Aug 2027, or any note"
                            value={b.tourDates}
                            onChange={e => updateBand(i, { tourDates: e.target.value })}
                          />
                        </div>
                        <DatesSuggestions rows={rows} band={b.name} current={b.tourDates} onUse={text => updateBand(i, { tourDates: text })} />
                        {/* Only worth asking once there is a choice to make. */}
                        {accounts.length > 1 && (
                          <div className="flex gap-2 items-center">
                            <label className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Sends as</label>
                            <select
                              className="flex-1 min-w-0 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                              value={b.mailAccountId || ''}
                              onChange={e => updateBand(i, { mailAccountId: e.target.value })}
                            >
                              <option value="">{accountLabel(accounts[0])} (default)</option>
                              {accounts.slice(1).map(a => (
                                <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {/* Types only some bands book (Venue types ▸ Booked by), from the band's side. */}
                        {restrictedTypes.map(t => (
                          <label key={t} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                            <input
                              type="checkbox"
                              checked={!!b.name && bandBooksType(typeRules, t, b.name)}
                              disabled={!b.name}
                              onChange={e => setBandBooksType(t, b.name, e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                            />
                            Books “{t}” venues
                            <span className="text-xs text-gray-400 dark:text-gray-500">— they show up in Send and the other lists for this band</span>
                          </label>
                        ))}
                      </div>
                    ))}
                    <div className="flex gap-2 items-center pt-1">
                      <input
                        className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="Add a band…"
                        value={newBand}
                        onChange={e => setNewBand(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBand() } }}
                      />
                      <button
                        type="button"
                        onClick={addBand}
                        className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    A band's Dates fill in the <span className="font-mono">Dates</span> of its venues that have none —
                    on Save you're asked whether to write a change onto them. A venue with no Dates whose band has none
                    either can't be emailed, and shows as Missing info. Renaming only changes this list — it doesn't
                    rewrite existing venues.
                  </p>
                </div>
              )}

              {section === 'templates' && (
                <div className="space-y-5">
                  <div>
                    <button type="button" onClick={() => onOpenTemplates?.()} className={outlineBtn}>
                      Manage email templates…
                    </button>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      One template per band and language. A venue's Country picks the language through
                      the map in the Languages section; anything unlisted falls back to the default.
                      Templates live in the app's own folder, separate from your settings file.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>German articles — <span className="font-mono">{'{{article}}'}</span></p>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(templateOpts.germanArticles ?? 'ondevice') !== 'off'}
                        onChange={e => setForm(f => ({ ...f, templates: { ...f.templates, germanArticles: e.target.checked ? 'ondevice' : 'off' } }))}
                        className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        Work out der/die/das for each venue — and Liebe / Lieber for each contact
                        <span className="block text-gray-400 dark:text-gray-500">
                          Put <span className="font-mono">{'{{article}}'}</span> where the article belongs —
                          <span className="font-mono"> in {'{{article}}'} {'{{venue}}'}</span> becomes
                          “in der Kulturfabrik” but “im Kulturzentrum”. The case comes from the words around it
                          (für → die, wegen → der), and “in dem” contracts to “im” on its own.
                        </span>
                      </span>
                    </label>

                    <div className="mt-2 rounded-md bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {!articleState ? 'Checking Apple Intelligence…'
                        : articleState.ok ? (
                          <>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready.</span>{' '}
                            The gender is worked out by Apple’s on-device model — nothing leaves your Mac, and each
                            venue is only ever asked about once.
                          </>
                        ) : articleState.status === 'disabled' ? (
                          <>
                            <span className="text-amber-600 dark:text-amber-400 font-medium">Apple Intelligence is switched off.</span>{' '}
                            Turn it on in <span className="font-medium">System Settings → Apple Intelligence &amp; Siri</span>, then
                            reopen this panel. Until then <span className="font-mono">{'{{article}}'}</span> is left out of drafts
                            and flagged as missing.
                          </>
                        ) : articleState.status === 'downloading' ? (
                          <>The on-device model is still downloading. This works once macOS has finished.</>
                        ) : articleState.status === 'ineligible' || articleState.status === 'unsupported' ? (
                          <>This Mac can’t run Apple’s on-device model — it needs Apple Silicon and macOS 26 or newer.
                            Drafts still work; <span className="font-mono">{'{{article}}'}</span> is left out and flagged.</>
                        ) : (
                          <>{articleState.error || 'The language helper is unavailable.'}</>
                        )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Addressing the contact — <span className="font-mono">{'{{greeting}}'}</span> and <span className="font-mono">{'{{contact}}'}</span></p>
                    <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                      Write <span className="font-mono">{'{{greeting}},'}</span> and it becomes the whole salutation.
                      In German, Apple’s on-device model reads the first name for Liebe / Lieber
                      (and Frau / Herr); a name it can’t place gets the neutral form.
                    </p>
                    <div className="space-y-1.5">
                      {[
                        { value: 'first', label: 'First name', hint: 'Liebe Anna · Lieber Thomas · Hallo Kim · Dear Anna' },
                        { value: 'full', label: 'Full name', hint: 'Liebe Anna Müller · Lieber Thomas Schmidt · Dear Anna Müller' },
                        { value: 'formal', label: 'Formal', hint: 'Sehr geehrte Frau Müller · Sehr geehrter Herr Schmidt · Guten Tag Kim Weber · Dear Ms Müller' },
                      ].map(o => (
                        <label key={o.value} className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="contact-style"
                            className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-400"
                            checked={(templateOpts.contactStyle || 'full') === o.value}
                            onChange={() => setTemplateOpt({ contactStyle: o.value })}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                            <span className="block text-xs text-gray-400 dark:text-gray-500">{o.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>Video links</p>
                    <div className="space-y-1.5">
                      {[
                        {
                          key: 'showLabel',
                          label: 'Text link under the thumbnail',
                          hint: 'The “▶ Video title” line. Turn this off for a bare thumbnail.',
                        },
                        {
                          key: 'playOverlay',
                          label: 'Play button on the thumbnail',
                          hint: 'Drawn into the image — mail clients cannot position an overlay reliably.',
                        },
                      ].map(o => (
                        <label key={o.key} className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                            checked={(templateOpts.video || {})[o.key] !== false}
                            onChange={e => setVideoOpt({ [o.key]: e.target.checked })}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-800 dark:text-gray-200">{o.label}</span>
                            <span className="block text-xs text-gray-400 dark:text-gray-500">{o.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      Both are applied when you insert a video, so changing them here affects the next
                      video you add — videos already in a template keep the look they were inserted with.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className={lbl}>When a venue has no contact name</p>
                    <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                      Used instead of an empty <span className="font-mono">{'{{contact}}'}</span>, per language.
                      It can itself contain placeholders — <span className="font-mono">{'{{venue}} Team'}</span> becomes
                      “Kulturzentrum Team”.
                    </p>
                    <div className="space-y-2">
                      {[...new Set([
                        form.languages?.default || 'en',
                        ...Object.values(form.languages?.map || {}),
                        ...Object.keys(templateOpts.contactFallbacks || {}),
                      ].map(l => String(l).trim().toLowerCase()).filter(Boolean))].sort().map(lang => (
                        <div key={lang} className="flex items-center gap-2">
                          <span className="w-10 shrink-0 text-xs font-mono text-gray-500 dark:text-gray-400">{lang}</span>
                          <input
                            className={input}
                            value={templateOpts.contactFallbacks?.[lang] ?? ''}
                            placeholder="{{venue}} team"
                            onChange={e => setContactFallback(lang, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                      Leave one empty to keep the old behaviour for that language: the placeholder resolves to
                      nothing and the venue is flagged in the draft preflight.
                    </p>
                  </div>
                </div>
              )}

              {section === 'mail' && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    One entry per mailbox you send from. Bands pick one in the <span className="font-medium">Bands</span>
                    {' '}section; everything else uses the first. Drafts go straight into that account's Drafts mailbox
                    over IMAP. iCloud needs an <span className="font-medium">app-specific password</span>, not your
                    Apple ID password.{' '}
                    <button type="button" onClick={() => api.openExternal('https://appleid.apple.com')} className="underline hover:text-gray-600 dark:hover:text-gray-300">
                      Create one at appleid.apple.com
                    </button>
                    . Gmail needs an <span className="font-medium">app password</span> too, which Google only offers once
                    2-Step Verification is on.{' '}
                    <button type="button" onClick={() => api.openExternal('https://myaccount.google.com/apppasswords')} className="underline hover:text-gray-600 dark:hover:text-gray-300">
                      Create one at myaccount.google.com
                    </button>
                  </p>

                  {accounts.map((acct, i) => {
                    const open = openAccount === acct.id
                    const test = accountTests[acct.id] || {}
                    return (
                      <div key={acct.id} className="rounded-lg border border-gray-200 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setOpenAccount(open ? null : acct.id)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                        >
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                              {accountLabel(acct)}
                            </span>
                            {i === 0 && <span className="ml-2 text-[11px] text-gray-400 dark:text-gray-500">default</span>}
                            <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">
                              {acct.user || 'not set up yet'}
                              {bandsUsing(acct.id).length > 0 && ` · ${bandsUsing(acct.id).join(', ')}`}
                            </span>
                          </span>
                          <span className="text-gray-400 shrink-0">{open ? '▴' : '▾'}</span>
                        </button>

                        {open && (
                          <div className="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-2">
                                <label className={lbl}>Name for this account</label>
                                <input className={input} value={acct.label} placeholder="e.g. Band A mail"
                                  onChange={e => setAccount(acct.id, { label: e.target.value })} />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-2">
                                <label className={lbl}>IMAP server</label>
                                <input className={monoInput} value={acct.host} placeholder="imap.mail.me.com"
                                  onChange={e => setAccount(acct.id, { host: e.target.value })} />
                              </div>
                              <div>
                                <label className={lbl}>Port</label>
                                <input className={monoInput} value={acct.port}
                                  onChange={e => setAccount(acct.id, { port: Number(e.target.value) || 993 })} />
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-2">
                                <label className={lbl}>SMTP server (sending)</label>
                                <input className={monoInput} value={acct.smtpHost}
                                  placeholder={defaultSmtpHost(acct.host) || 'smtp.…'}
                                  onChange={e => setAccount(acct.id, { smtpHost: e.target.value })} />
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                  Left blank, it is worked out from the IMAP server above.
                                </p>
                              </div>
                              <div>
                                <label className={lbl}>Port</label>
                                <select className={input} value={acct.smtpPort}
                                  onChange={e => setAccount(acct.id, { smtpPort: Number(e.target.value) })}>
                                  <option value={587}>587 — STARTTLS</option>
                                  <option value={465}>465 — TLS</option>
                                  <option value={25}>25 — plain</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={lbl}>Username</label>
                                <input className={monoInput} value={acct.user} placeholder="you@icloud.com"
                                  onChange={e => setAccount(acct.id, { user: e.target.value })} />
                              </div>
                              <div>
                                <label className={lbl}>Password</label>
                                <input
                                  type="password" className={input}
                                  value={accountPasswords[acct.id] || ''}
                                  placeholder={hasPassword[acct.id] ? '•••••••• stored' : 'app-specific password'}
                                  onChange={e => setAccountPasswords(p => ({ ...p, [acct.id]: e.target.value }))}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={lbl}>From address</label>
                                <input className={monoInput} value={acct.fromAddress} placeholder="same as username"
                                  onChange={e => setAccount(acct.id, { fromAddress: e.target.value })} />
                              </div>
                              <div>
                                <label className={lbl}>From name</label>
                                <input className={input} value={acct.fromName}
                                  onChange={e => setAccount(acct.id, { fromName: e.target.value })} />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={lbl}>Drafts mailbox</label>
                                <input className={monoInput} value={acct.draftsMailbox} placeholder="found automatically"
                                  onChange={e => setAccount(acct.id, { draftsMailbox: e.target.value })} />
                              </div>
                              <div>
                                <label className={lbl}>Sent mailbox</label>
                                <input className={monoInput} value={acct.sentMailbox} placeholder="found automatically"
                                  onChange={e => setAccount(acct.id, { sentMailbox: e.target.value })} />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => testAccount(acct.id, 'imap')} disabled={!!test.busy} className={outlineBtn}>
                                {test.busy === 'imap' ? 'Connecting…' : 'Test receiving (IMAP)'}
                              </button>
                              <button type="button" onClick={() => testAccount(acct.id, 'smtp')} disabled={!!test.busy} className={outlineBtn}>
                                {test.busy === 'smtp' ? 'Checking…' : 'Test sending (SMTP)'}
                              </button>
                              {confirmRemove === acct.id ? (
                                <span className="ml-auto flex items-center gap-2 text-xs text-red-700 dark:text-red-400">
                                  Remove it, and its password from the keychain?
                                  <button type="button" onClick={() => { setConfirmRemove(null); removeAccount(acct.id) }}
                                    className="font-semibold underline hover:no-underline">Remove</button>
                                  <button type="button" onClick={() => setConfirmRemove(null)}
                                    className="text-gray-500 dark:text-gray-400 underline hover:no-underline">Cancel</button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemove(acct.id)}
                                  className="ml-auto text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                  Remove account
                                </button>
                              )}
                            </div>
                            {test.message && (
                              <p className={`text-xs ${test.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {test.message}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button type="button" onClick={addAccount} className={outlineBtn}>
                    Add another account…
                  </button>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
                    <div>
                      <p className={lbl}>Keeping “Last emailed” up to date</p>
                      <div className="space-y-1.5">
                        {[
                          { v: 'onSend', label: 'Stamp today’s date when I draft or send', hint: 'No server access needed. Misses anything you sent from Mail itself.' },
                          { v: 'imap', label: 'Read the real date from my Sent mailbox', hint: 'Catches everything, however you sent it. Needs the IMAP details above.' },
                          { v: 'off', label: 'Leave it to me', hint: 'The column is only ever changed by hand.' },
                        ].map(o => (
                          <label key={o.v} className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio" name="syncLastEmailed" value={o.v}
                              checked={(sync.lastEmailed || 'onSend') === o.v}
                              onChange={() => setSync({ lastEmailed: o.v })}
                              className="mt-0.5 border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-300">
                              {o.label}
                              <span className="block text-gray-400 dark:text-gray-500">{o.hint}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={lbl}>Reply status</p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sync.replies === 'imap'}
                          onChange={e => setSync({ replies: e.target.checked ? 'imap' : 'off' })}
                          className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          Read the last reply date from my inbox
                          <span className="block text-gray-400 dark:text-gray-500">
                            Fills the Reply status column, telling a real answer apart from an
                            out-of-office auto-responder. Only possible over IMAP.
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div>
                        <label className={lbl}>Look back</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="1" max="240"
                            className={`${input} w-20`}
                            value={sync.months ?? 24}
                            onChange={e => setSync({ months: Number(e.target.value) })}
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500">months</span>
                        </div>
                      </div>
                      <label className="col-span-2 flex items-start gap-2 cursor-pointer pb-1">
                        <input
                          type="checkbox"
                          checked={!!sync.onOpen}
                          onChange={e => setSync({ onOpen: e.target.checked })}
                          className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          Check once when the app opens
                          <span className="block text-gray-400 dark:text-gray-500">
                            Otherwise only when you press ↻.
                          </span>
                        </span>
                      </label>
                    </div>

                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      A sync never writes to your CSV. It stages the dates as pending edits, exactly like
                      typing them in — you review them and press Save. Dates already in the CSV are only
                      ever moved forward, never back.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <p className="text-xs min-h-[1rem]">
              {error || ruleErrors.length > 0 ? (
                <span className="text-red-600 dark:text-red-400">
                  {error || `${ruleErrors.length} problem${ruleErrors.length !== 1 ? 's' : ''} in Rules`}
                </span>
              ) : savedAt ? (
                <span className="text-green-600 dark:text-green-400">Saved</span>
              ) : dirty ? (
                <span className="text-gray-400 dark:text-gray-500">Unsaved changes</span>
              ) : null}
            </p>
            <div className="flex gap-3 shrink-0">
              <button type="button" onClick={onClose} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                {dirty ? 'Discard & close' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={saving || ruleErrors.length > 0}
                className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// Under an empty band Dates field: what the band's venues already carry, to
// pick from.
function DatesSuggestions({ rows, band, current, onUse }) {
  const shown = band && !current.trim() ? datesSuggestions(rows, band) : []
  if (!shown.length) return null
  return (
    <div className="pl-16 text-xs text-gray-500 dark:text-gray-400 space-y-1">
      <p>{shown.length === 1 ? 'Its venues say:' : 'Its venues don’t agree — pick one, or type your own:'}</p>
      <ul className="space-y-0.5">
        {shown.slice(0, 6).map(x => (
          <li key={x.text} className="flex items-center gap-2">
            <button type="button" onClick={() => onUse(x.text)}
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Use</button>
            <span className={x.past ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}>{x.text}</span>
            <span className="text-gray-400 dark:text-gray-500">· {x.count} venue{x.count !== 1 ? 's' : ''}{x.past ? ' · past' : ''}</span>
          </li>
        ))}
      </ul>
      {shown.length > 1 && (
        <p className="text-gray-400 dark:text-gray-500">Venues with other dates are listed in the banner above the list afterwards — overwrite them there, or keep each one’s own.</p>
      )}
    </div>
  )
}

// One venue type and its rule (Settings ▸ Venue types).
function TypeRuleRow({ type, rule, bandNames, input, onRename, onRule, onRemove, confirming, onConfirmRemove, onCancelRemove }) {
  const restricted = rule.bands !== null
  const small = 'rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500'
  const toggleBand = name => {
    const has = rule.bands.some(b => b.toLowerCase() === name.toLowerCase())
    onRule({ bands: has ? rule.bands.filter(b => b.toLowerCase() !== name.toLowerCase()) : [...rule.bands, name] })
  }
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input className={input} value={type} onChange={e => onRename(e.target.value)} aria-label="Type name" />
        <select className={`${small} shrink-0`} value={rule.behaves} onChange={e => onRule({ behaves: e.target.value })} title="What venues of this type do">
          {TYPE_BEHAVIOURS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <button
          type="button"
          onClick={onRemove}
          title="Remove from the dropdown (venues keep their value)"
          className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 px-2 text-lg leading-none"
        >
          &times;
        </button>
      </div>
      {rule.behaves !== 'never' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-16 shrink-0">Booked by</span>
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={!restricted} onChange={() => onRule({ bands: null })} className="text-indigo-600 focus:ring-indigo-500" />
            all bands
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={restricted} onChange={() => onRule({ bands: [] })} className="text-indigo-600 focus:ring-indigo-500" />
            only
          </label>
          {restricted && (bandNames.length ? bandNames.map(name => {
            const on = rule.bands.some(b => b.toLowerCase() === name.toLowerCase())
            return (
              <button key={name} type="button" onClick={() => toggleBand(name)} aria-pressed={on}
                className={`px-2 py-0.5 rounded-full border transition-colors ${on
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'}`}>
                {name}
              </button>
            )
          }) : <span className="text-gray-400">no bands yet (Bands section)</span>)}
          {restricted && !rule.bands.length && bandNames.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">no band books these right now</span>
          )}
        </div>
      )}
      {rule.behaves !== 'never' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-16 shrink-0">Follow up</span>
          every
          <input
            type="number" min="1" className={`${small} w-20`}
            value={rule.frequencyDays ?? ''}
            placeholder="default"
            onChange={e => onRule({ frequencyDays: e.target.value ? Number(e.target.value) : null })}
          />
          days <span className="text-gray-400 dark:text-gray-500">— empty: the Rules default. A venue’s own Follow-up Interval still wins.</span>
        </div>
      )}
      {confirming && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-2.5 space-y-2 text-xs text-amber-800 dark:text-amber-300">
          <p>
            <span className="font-semibold">“{type}”</span> is{' '}
            {confirming.rule.length > 0 && <>used in the Rules flow ({confirming.rule.join('; ')})</>}
            {confirming.rule.length > 0 && confirming.venues > 0 && ' and '}
            {confirming.venues > 0 && <>set on {confirming.venues} venue{confirming.venues !== 1 ? 's' : ''}</>}.
            {' '}Deleting it {confirming.rule.length > 0 ? 'turns those venues into ordinary ones' : 'only removes it from the dropdown'} — the venues keep the word.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onConfirmRemove} className="bg-amber-600 text-white font-medium px-2.5 py-1 rounded-md hover:bg-amber-700">Delete</button>
            <button type="button" onClick={onCancelRemove} className="px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
