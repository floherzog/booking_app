// Settings sync between a Mac app and the web app it is connected to (Settings
// ▸ General ▸ Sync with your web app; src/main/ipc/webSync.js). Both builds keep
// `syncStamps` — when each synced section last changed — and a merge takes each
// section from whichever side changed it last. Per section, not per field: one
// person edits one thing at a time, and a section is small.

// What syncs. `csvLocation` is not a key of its own: it is storage.github
// ({ repo, path }), the only part of `storage` both builds understand.
// Everything else — mail accounts, local file paths, general, the draft log,
// webSync itself — stays where it is.
export const SYNCED = [
  'rules', 'bands', 'venueTypes', 'venueTypeRules', 'venueTypesVersion',
  'filterChips', 'dismissedDupes', 'keptVenueDates', 'dismissedSuggestions', 'languages', 'templates',
  'csvLocation',
]

function read(settings, section) {
  if (section === 'csvLocation') {
    const g = settings?.storage?.github || {}
    return { repo: g.repo || '', path: g.path || '' }
  }
  return settings?.[section]
}

function write(settings, section, value) {
  if (section !== 'csvLocation') return { ...settings, [section]: value }
  return { ...settings, storage: { ...settings.storage, github: { ...settings.storage?.github, ...value } } }
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// `next` with the stamp of every synced section that differs from `prev` set
// to `now` (an ISO string). Called by both builds whenever they save.
export function stampChanges(prev, next, now = new Date().toISOString()) {
  const stamps = { ...(prev?.syncStamps || {}), ...(next?.syncStamps || {}) }
  for (const section of SYNCED) {
    if (!same(read(prev, section), read(next, section))) stamps[section] = now
  }
  return { ...next, syncStamps: stamps }
}

// Every section stamped `now`: the side chosen on the first connect wins whole.
export function stampAll(settings, now = new Date().toISOString()) {
  return { ...settings, syncStamps: Object.fromEntries(SYNCED.map(s => [s, now])) }
}

// Each synced section from whichever side stamped it later; a section stamped
// on one side only comes from that side; unstamped on both, it stays as it is.
// → { local, remote, changedLocal, changedRemote }, both sides with the same
// stamps afterwards. changedLocal means a setting itself came in (stamps alone
// don't count — nothing to show); changedRemote includes stamps, so the web
// app learns them. `adoptCsv` (the Mac's "Also use the web app's CSV"): a
// csvLocation taken from the remote side also switches local storage to GitHub.
export function mergeSynced(local, remote, { adoptCsv = false } = {}) {
  let l = local || {}
  let r = remote || {}
  let changedLocal = false
  let changedRemote = false
  const stamps = {}
  const ls = l.syncStamps || {}
  const rs = r.syncStamps || {}
  for (const section of SYNCED) {
    const lt = ls[section] || ''
    const rt = rs[section] || ''
    if (lt || rt) stamps[section] = lt > rt ? lt : rt
    if (lt === rt) continue
    const from = lt > rt ? l : r
    const value = read(from, section)
    if (value === undefined) continue // a side that never had the section can't hand it over
    if (from === r) {
      if (!same(read(l, section), value)) { l = write(l, section, value); changedLocal = true }
      if (section === 'csvLocation' && adoptCsv && value.repo && l.storage?.adapter !== 'github') {
        l = { ...l, storage: { ...l.storage, adapter: 'github' } }
        changedLocal = true
      }
    } else if (!same(read(r, section), value)) {
      r = write(r, section, value)
      changedRemote = true
    }
  }
  if (!same(rs, stamps)) changedRemote = true
  return { local: { ...l, syncStamps: stamps }, remote: { ...r, syncStamps: stamps }, changedLocal, changedRemote }
}
