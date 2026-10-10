import { parseCsvText, parseCsvRaw, serializeCsv } from '@core/csv'
import { emptyManifest, fileForBand, routeRows, linkVenues, mergeRows, inferBandFileSet } from '@core/multiBand'
import { looksLikeAppCsv } from '@core/importMap'
import { bandName } from '@core/bands'

// Turning multi-band mode on (split one CSV into a file per band) and off
// (merge them back). Both refuse rather than overwrite anything: the split never
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
    throw new Error('Multi-band mode needs a local CSV file (Settings ▸ Data & storage).')
  }
  const { dir, name, base } = splitPath(source)
  const { text } = await window.bookingApi.readCsvFile(source)
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
    if (await window.bookingApi.fileExists(f)) clashes.push(fileName(f))
  }
  return { dir, source: name, backup: fileName(backup), backupPath: backup, files, clashes, manifest: routed.manifest, routed, sourcePath: source }
}

// → the new `storage` settings section.
export async function enableMultiBand(settings) {
  const plan = await planSplit(settings)
  if (plan.clashes.length) {
    throw new Error(`These files already exist in that folder: ${plan.clashes.join(', ')}. Move them away first.`)
  }
  await window.bookingApi.writeCsvFiles({
    files: [...plan.routed.files].map(([path, rows]) => ({ path, text: serializeCsv(rows), expectedMtimeMs: null })),
  })
  await window.bookingApi.moveFile({ from: plan.sourcePath, to: plan.backupPath })
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
  if (await window.bookingApi.fileExists(target)) target = `${mb.dir}/${mb.base}-merged-${stamp()}.csv`
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
  await window.bookingApi.writeCsvFiles({
    files: [{ path: plan.target, text: serializeCsv(merged), expectedMtimeMs: null }],
  })
  for (const path of [mb.unassigned, ...Object.values(mb.files || {})]) {
    if (!path || !(await window.bookingApi.fileExists(path))) continue
    await window.bookingApi.moveFile({ from: path, to: `${plan.backupDir}/${fileName(path)}` })
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
  const names = await window.bookingApi.listCsvFiles(dir)
  const read = await window.bookingApi.readCsvFiles(names.map(n => `${dir}/${n}`))
  const parsed = new Map()
  for (const { path, text, missing } of read) {
    if (missing) continue
    parsed.set(fileName(path), await parseCsvText(text))
  }
  const entries = [...parsed].map(([n, rows]) => ({ name: n, bands: distinctBands(rows), rows: rows.length }))
  const set = inferBandFileSet(name, entries)
  if (set.error) throw new Error(set.error)
  if (!Object.keys(set.files).length && !set.unassigned) throw new Error(`No band files found next to ${name}.`)

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
  if (plan.missingUnassigned) await window.bookingApi.createCsvFile(plan.manifest.unassigned)
  return storageFor(settings, plan.manifest, plan.sourcePath)
}

// --- New set of band files: start empty somewhere else -----------------------

// `savePath`: what the save dialog returned, e.g. ".../Tour 2027/booking.csv" —
// its folder and name become the set's folder and prefix.
export async function planNewBandSet(settings, savePath) {
  const { dir, base } = splitPath(savePath)
  let manifest = emptyManifest(dir, base)
  for (const b of settings.bands || []) {
    if (bandName(b).trim()) manifest = fileForBand(manifest, bandName(b)).manifest
  }
  const paths = [manifest.unassigned, ...Object.values(manifest.files)]
  const clashes = []
  for (const p of paths) if (await window.bookingApi.fileExists(p)) clashes.push(fileName(p))
  const bandOf = new Map(Object.entries(manifest.files).map(([band, p]) => [p, band]))
  return {
    kind: 'newset', dir, base, manifest, clashes, sourcePath: `${dir}/${base}.csv`,
    files: paths.map(p => ({ path: p, name: fileName(p), band: bandOf.get(p) || '', count: 0 })),
  }
}

export async function createNewBandSet(settings, plan) {
  if (plan.clashes.length) throw new Error(`Already in that folder: ${plan.clashes.join(', ')}. Pick another name or folder.`)
  await window.bookingApi.writeCsvFiles({
    files: plan.files.map(f => ({ path: f.path, text: serializeCsv([]), expectedMtimeMs: null })),
  })
  return storageFor(settings, plan.manifest, plan.sourcePath)
}

// --- Import band files: add the venues of several files ----------------------

// → { kind: 'import', rows, files: [{ name, band, count }], venues }. Every file
// has to be a booking CSV already (app columns): mapping foreign columns is what
// the single-file Import CSV wizard is for. A venue keeps the Band its file says
// — a row with an empty Band in a file of one band gets that band.
export async function planImportBandFiles(paths) {
  if (!paths?.length) return null
  const read = await window.bookingApi.readCsvFiles(paths)
  const rows = []
  const files = []
  for (const { path, text, missing } of read) {
    const name = fileName(path)
    if (missing) throw new Error(`${name} could not be read.`)
    const { headers } = await parseCsvRaw(text)
    if (!looksLikeAppCsv(headers)) {
      throw new Error(`${name} doesn't have the app's columns. Import it on its own with Import CSV…, which lets you match its columns.`)
    }
    const fileRows = await parseCsvText(text)
    const bands = distinctBands(fileRows)
    const band = bands.length === 1 ? bands[0] : ''
    for (const r of fileRows) rows.push(band && !r['Band'] ? { ...r, Band: band } : r)
    files.push({ name, band: bands.length > 1 ? `${bands.length} bands` : band, count: fileRows.length })
  }
  const venues = new Set(linkVenues(rows).map(r => r._venueId)).size
  return { kind: 'import', rows, files, venues }
}
