import { parseCsvText, serializeCsv } from '@core/csv'
import { emptyManifest, fileForBand, routeRows, linkVenues, mergeRows, inferBandFileSet } from '@core/multiBand'
import { bandName } from '@core/bands'
import { api } from '../platform'
import { t } from '../i18n'

// Band files: the one-CSV-per-band storage of Booking ≤ 0.18. The app no
// longer splits a list into them — every band lives in one CSV — but a list
// still in band files is read until it is combined (disableMultiBand), and the
// set can be opened on another Mac or followed to a new folder first. The
// split (planSplit / enableMultiBand) stays for the tests, which build band
// files with it. Turning multi-band mode on (split one CSV into a file per
// band) and off (merge them back). Both refuse rather than overwrite anything: the split never
// writes over an existing file, the original CSV is renamed, not deleted, and
// the band files are moved into a backup folder when merging back.

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function splitPath(path) {
  const i = path.lastIndexOf('/')
  const dir = path.slice(0, i)
  const name = path.slice(i + 1)
  return { dir, name, base: name.replace(/\.csv$/i, '') }
}

const fileName = path => path.split('/').pop()

// What switching on would do, without doing it — the confirmation dialog shows
// this. → { dir, backup, files: [{ name, band, count }], manifest, routed }
export async function planSplit(settings) {
  const source = settings?.storage?.filePath
  if (settings?.storage?.adapter === 'github' || !source) {
    throw new Error(t('Multi-band mode needs a local CSV file (Settings ▸ Data & storage).'))
  }
  const { dir, name, base } = splitPath(source)
  const { text } = await api.readCsvFile(source)
  const rows = await parseCsvText(text)

  // Every managed band gets a file, even one with no venues yet.
  let manifest = emptyManifest(dir, base)
  for (const b of settings.bands || []) {
    if (bandName(b).trim()) manifest = fileForBand(manifest, bandName(b)).manifest
  }
  const routed = routeRows(rows, manifest)
  const bandOf = new Map(Object.entries(routed.manifest.files).map(([band, path]) => [path, band]))
  const files = [...routed.files].map(([path, fileRows]) => ({
    path, name: fileName(path), band: bandOf.get(path) || '', count: fileRows.length,
  }))
  const backup = `${dir}/${base}.before-multiband-${stamp()}.csv`

  const clashes = []
  for (const f of [...files.map(x => x.path), backup]) {
    if (await api.fileExists(f)) clashes.push(fileName(f))
  }
  return { dir, source: name, backup: fileName(backup), backupPath: backup, files, clashes, manifest: routed.manifest, routed, sourcePath: source }
}

// → the new `storage` settings section.
export async function enableMultiBand(settings) {
  const plan = await planSplit(settings)
  if (plan.clashes.length) {
    throw new Error(t('These files already exist in that folder: {files}. Move them away first.', { files: plan.clashes.join(', ') }))
  }
  await api.writeCsvFiles({
    files: [...plan.routed.files].map(([path, rows]) => ({ path, text: serializeCsv(rows), expectedMtimeMs: null })),
  })
  await api.moveFile({ from: plan.sourcePath, to: plan.backupPath })
  return {
    ...settings.storage,
    multiBand: { enabled: true, ...plan.manifest, sourcePath: plan.sourcePath },
  }
}

// What switching off would do. → { target, backupDir, venues, lines }
export async function planMerge(settings, rows) {
  const mb = settings.storage.multiBand
  let target = mb.sourcePath || `${mb.dir}/${mb.base}.csv`
  // Never write over a file that turned up there in the meantime.
  if (await api.fileExists(target)) target = `${mb.dir}/${mb.base}-merged-${stamp()}.csv`
  const backupDir = `${mb.dir}/${mb.base}-bands-backup-${stamp()}`
  const venues = new Set(rows.map(r => r._venueId)).size
  return { target, targetName: fileName(target), backupDir, backupName: fileName(backupDir), venues, lines: rows.length }
}

// `rows` are the loaded entries (no unsaved edits — the caller makes sure).
// → the new `storage` settings section.
export async function disableMultiBand(settings, rows) {
  const mb = settings.storage.multiBand
  const plan = await planMerge(settings, rows)
  const merged = mergeRows(rows[0]?._venueId ? rows : linkVenues(rows))
  await api.writeCsvFiles({
    files: [{ path: plan.target, text: serializeCsv(merged), expectedMtimeMs: null }],
  })
  for (const path of [mb.unassigned, ...Object.values(mb.files || {})]) {
    if (!path || !(await api.fileExists(path))) continue
    await api.moveFile({ from: path, to: `${plan.backupDir}/${fileName(path)}` })
  }
  return {
    ...settings.storage,
    adapter: 'file',
    filePath: plan.target,
    multiBand: { enabled: false, dir: '', base: '', files: {}, unassigned: '', sourcePath: '' },
  }
}

// --- Open band files: use a set that already exists --------------------------
// A second Mac, or a friend with a copy, has the files but not this Mac's list
// of them. The user picks any one; the rest of the set is found in its folder.

function storageFor(settings, manifest, sourcePath) {
  return {
    ...settings.storage,
    adapter: 'file',
    filePath: sourcePath,
    multiBand: { enabled: true, ...manifest, sourcePath },
  }
}

const distinctBands = rows => [...new Set(rows.map(r => String(r['Band'] || '').trim()).filter(Boolean))]

// → { kind: 'open', dir, base, files: [{ name, band, count }], unassigned,
//     skipped, missingUnassigned, manifest, sourcePath } — or throws with a
//     message meant for the user.
export async function planOpenBandFiles(pickedPath) {
  const { dir, name } = splitPath(pickedPath)
  const names = await api.listCsvFiles(dir)
  const read = await api.readCsvFiles(names.map(n => `${dir}/${n}`))
  const parsed = new Map()
  for (const { path, text, missing } of read) {
    if (missing) continue
    parsed.set(fileName(path), await parseCsvText(text))
  }
  const entries = [...parsed].map(([n, rows]) => ({ name: n, bands: distinctBands(rows), rows: rows.length }))
  const set = inferBandFileSet(name, entries, t)
  if (set.error) throw new Error(set.error)
  if (!Object.keys(set.files).length && !set.unassigned) throw new Error(t('No band files found next to {name}.', { name }))

  const unassigned = set.unassigned || `${set.base}-unassigned.csv`
  const manifest = {
    dir,
    base: set.base,
    files: Object.fromEntries(Object.entries(set.files).map(([band, n]) => [band, `${dir}/${n}`])),
    unassigned: `${dir}/${unassigned}`,
  }
  const files = [
    ...Object.entries(set.files).map(([band, n]) => ({ name: n, band, count: parsed.get(n)?.length || 0 })),
    { name: unassigned, band: '', count: set.unassigned ? (parsed.get(unassigned)?.length || 0) : 0 },
  ]
  return {
    kind: 'open', dir, base: set.base, files, skipped: set.skipped,
    missingUnassigned: !set.unassigned, manifest, sourcePath: `${dir}/${set.base}.csv`,
  }
}

// → the new `storage` section. The unassigned file is created if the set has
// none yet, so the first load does not report it missing.
export async function openBandFiles(settings, plan) {
  if (plan.missingUnassigned) await api.createCsvFile(plan.manifest.unassigned)
  return storageFor(settings, plan.manifest, plan.sourcePath)
}

// --- Moving the set: the band files' folder was moved, or should be ----------
// The stored paths name a folder. When the files are no longer there (renamed,
// moved in Finder, set up on another Mac), point the app at where they are now;
// when they still are, move them to the folder chosen.

// → { kind: 'relocate', dir, found, toMove, missing, clashes, sourcePath }
// (file names). `found` are already in the new folder, `toMove` are still in
// the old one and get moved, `missing` are in neither and are created empty on
// the next Save.
export async function planRelocate(settings, newDir) {
  const mb = settings.storage.multiBand
  const paths = [mb.unassigned, ...Object.values(mb.files || {})].filter(Boolean)
  const found = []
  const toMove = []
  const missing = []
  const clashes = []
  for (const path of paths) {
    const target = `${newDir}/${fileName(path)}`
    const there = await api.fileExists(target)
    const here = path !== target && await api.fileExists(path)
    if (there && here) clashes.push(fileName(path))
    else if (there) found.push(fileName(path))
    else if (here) toMove.push(fileName(path))
    else missing.push(fileName(path))
  }
  // The single CSV that switching off merges back to moves along when it lived
  // with the band files.
  const source = mb.sourcePath || `${mb.dir}/${mb.base}.csv`
  const sourcePath = splitPath(source).dir === mb.dir ? `${newDir}/${fileName(source)}` : source
  return { kind: 'relocate', dir: newDir, oldDir: mb.dir, found, toMove, missing, clashes, sourcePath }
}

// → the new `storage` section.
export async function relocateBandFiles(settings, plan) {
  if (plan.clashes.length) {
    throw new Error(t('Both folders have {files}. Move one copy away first.', { files: plan.clashes.join(', ') }))
  }
  const mb = settings.storage.multiBand
  for (const name of plan.toMove) {
    await api.moveFile({ from: `${mb.dir}/${name}`, to: `${plan.dir}/${name}` })
  }
  const moved = path => (path ? `${plan.dir}/${fileName(path)}` : path)
  return storageFor(settings, {
    dir: plan.dir,
    base: mb.base,
    files: Object.fromEntries(Object.entries(mb.files || {}).map(([band, path]) => [band, moved(path)])),
    unassigned: moved(mb.unassigned),
  }, plan.sourcePath)
}

// Multi-band mode off without merging — for band files that are gone. The app
// goes back to the single CSV they came from; if that is gone too, the
// first-run screen offers to pick or create one.
export function forgetBandFiles(settings) {
  const mb = settings.storage.multiBand
  return {
    ...settings.storage,
    adapter: 'file',
    filePath: mb.sourcePath || `${mb.dir}/${mb.base}.csv`,
    multiBand: { enabled: false, dir: '', base: '', files: {}, unassigned: '', sourcePath: '' },
  }
}
