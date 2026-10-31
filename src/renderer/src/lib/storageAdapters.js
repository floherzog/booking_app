import { parseCsvText, serializeCsv } from '@core/csv'
import { routeRows, isMultiBand } from '@core/multiBand'
import { api } from '../platform'
import { t } from '../i18n'

// A storage adapter is the only thing that knows where the CSV lives:
//   { kind, label, configured, load(): { rows }, save(rows, message) }
// Both adapters go through core parseCsvText/serializeCsv, so the file stays
// byte-compatible with the webapp and the OpenClaw scripts either way.

function fileAdapter(storage) {
  const path = storage.filePath
  // Conflict guard: remember the mtime we read, refuse to write over a newer one.
  let loadedMtimeMs = null

  return {
    kind: 'file',
    label: path ? path.split('/').pop() : t('no file chosen'),
    detail: path,
    configured: !!path,
    async load() {
      const { text, mtimeMs } = await api.readCsvFile(path)
      loadedMtimeMs = mtimeMs
      return { rows: await parseCsvText(text) }
    },
    async save(rows, _message, { force = false } = {}) {
      const text = serializeCsv(rows)
      const { mtimeMs } = await api.writeCsvFile({
        path, text, expectedMtimeMs: loadedMtimeMs, force,
      })
      loadedMtimeMs = mtimeMs
    },
  }
}

function githubAdapter(storage) {
  const { repo, path } = storage.github || {}
  let loadedSha = null

  return {
    kind: 'github',
    label: repo && path ? `${repo}/${path}` : t('GitHub not configured'),
    detail: repo && path ? `${repo} · ${path}` : '',
    configured: !!(repo && path),
    async load() {
      const { text, sha } = await api.githubFetchCsv({ repo, path })
      loadedSha = sha
      return { rows: await parseCsvText(text) }
    },
    async save(rows, message, { force = false } = {}) {
      const text = serializeCsv(rows)
      const { sha } = await api.githubPushCsv({
        repo, path, text, message, expectedSha: force ? null : loadedSha,
      })
      loadedSha = sha ?? loadedSha
    },
  }
}

// Multi-band mode: one CSV per band plus one for venues without a band, loaded
// as one table. Each entry remembers its file (`_file`); on save every entry is
// routed by its Band column, so changing an entry's band moves it to that
// band's file. A new band gets a new file, and the adapter's `manifest` then
// differs from the stored one — App persists it after a successful save.
function multiBandAdapter(storage) {
  let manifest = storage.multiBand
  const mtimes = {}
  const label = manifest.base ? t('{base}-*.csv (one per band)', { base: manifest.base }) : t('band files')

  function paths() {
    return [manifest.unassigned, ...Object.values(manifest.files || {})].filter(Boolean)
  }

  return {
    kind: 'multiBand',
    label,
    detail: manifest.dir,
    configured: !!manifest.unassigned,
    get manifest() { return manifest },
    // A band renamed in Settings keeps its file. In memory until the next save,
    // like the Band edits on its venues that go with it.
    renameBand(from, to) {
      if (!manifest.files?.[from] || manifest.files?.[to]) return
      const files = { ...manifest.files, [to]: manifest.files[from] }
      delete files[from]
      manifest = { ...manifest, files }
    },
    async load() {
      const bandOf = new Map(Object.entries(manifest.files || {}).map(([band, path]) => [path, band]))
      const results = await api.readCsvFiles(paths())
      const rows = []
      const missing = []
      for (const { path, text, mtimeMs, missing: gone } of results) {
        mtimes[path] = mtimeMs
        if (gone) { missing.push(path.split('/').pop()); continue }
        const band = bandOf.get(path) || ''
        for (const r of await parseCsvText(text)) {
          // The file a row sits in is its band; an empty Band cell there would
          // otherwise route it to the unassigned file on the next save.
          rows.push({ ...r, Band: r['Band'] || band, _file: path })
        }
      }
      return { rows, missing }
    },
    async save(rows, _message, { force = false } = {}) {
      // Every file gets every column: Papa takes a file's header from its first
      // row, and an entry moving between files must not lose a column on the way.
      const columns = new Set()
      for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith('_')) columns.add(k)
      const full = rows.map(r => {
        const out = { ...r }
        for (const c of columns) if (!(c in out)) out[c] = ''
        return out
      })
      const routed = routeRows(full, manifest)
      const files = [...routed.files].map(([path, fileRows]) => ({
        path, text: serializeCsv(fileRows), expectedMtimeMs: mtimes[path] ?? null,
      }))
      const result = await api.writeCsvFiles({ files, force })
      Object.assign(mtimes, result.mtimes)
      manifest = routed.manifest
    },
  }
}

export function getAdapter(settings) {
  const storage = settings?.storage || {}
  if (isMultiBand(settings)) return multiBandAdapter(storage)
  return storage.adapter === 'github' ? githubAdapter(storage) : fileAdapter(storage)
}

// True once the chosen adapter has everything it needs to load.
export function isStorageConfigured(settings) {
  return getAdapter(settings).configured
}
