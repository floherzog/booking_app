import { readFile, writeFile, rename, stat, unlink, mkdir, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { APP_COLUMNS } from '../../core/constants.js'

const CSV_FILTERS = [{ name: 'CSV', extensions: ['csv'] }]

function parentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || undefined
}

async function mtimeOf(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return null
  }
}

// Same-directory temp + rename. Writing straight to an iCloud Drive file risks a
// partially-written CSV if the app dies mid-write; a rename is atomic.
async function atomicWrite(path, text) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  try {
    await writeFile(tmp, text, 'utf8')
    await rename(tmp, path)
  } catch (e) {
    try { await unlink(tmp) } catch { /* ignore */ }
    throw e
  }
}

// --- Multi-band mode: one CSV per band, read and written as a set -------------

// → [{ path, text, mtimeMs, missing }]. A missing band file is reported rather
// than thrown: it is an empty band, recreated on the next save.
export async function readCsvFiles(paths) {
  return Promise.all((paths || []).map(async path => {
    try {
      const text = await readFile(path, 'utf8')
      return { path, text, mtimeMs: await mtimeOf(path), missing: false }
    } catch (e) {
      if (e.code === 'ENOENT') return { path, text: '', mtimeMs: null, missing: true }
      throw e
    }
  }))
}

// Every file is checked before any is written, so a conflict on the fifth file
// does not leave the first four already overwritten. Then all temp files are
// written, and only then renamed into place: the window in which a crash could
// leave a mixed set is the renames alone.
export async function writeCsvFiles({ files = [], force = false } = {}) {
  if (!force) {
    for (const { path, expectedMtimeMs } of files) {
      const current = await mtimeOf(path)
      // A file we never saw (new band) must not exist by now either; one we did
      // see must not have changed.
      const changed = expectedMtimeMs == null ? current != null : current !== expectedMtimeMs
      if (changed) throw new Error(`CSV_CONFLICT: ${basename(path)} changed on disk since it was loaded.`)
    }
  }
  const staged = []
  try {
    for (const { path, text } of files) {
      const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
      await writeFile(tmp, text, 'utf8')
      staged.push({ tmp, path })
    }
    for (const { tmp, path } of staged) await rename(tmp, path)
  } catch (e) {
    for (const { tmp } of staged) { try { await unlink(tmp) } catch { /* renamed or gone */ } }
    throw e
  }
  const mtimes = {}
  for (const { path } of files) mtimes[path] = await mtimeOf(path)
  return { mtimes }
}

// Backups when switching multi-band mode on or off. Never overwrites: losing the
// file being backed up to is exactly what a backup is meant to prevent.
export async function moveFile({ from, to }) {
  if (await mtimeOf(to) != null) throw new Error(`${basename(to)} already exists — move it away first.`)
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
  return { path: to }
}

// The CSV files directly in `dir` (not hidden, not in subfolders) — what
// "Open band files…" looks through to find the rest of a set.
export async function listCsvFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(e => e.isFile() && !e.name.startsWith('.') && /\.csv$/i.test(e.name))
    .map(e => e.name)
    .sort()
}

export function registerStorageIpc() {
  ipcMain.handle('dialog:pickCsvOpen', async event => {
    const r = await dialog.showOpenDialog(parentWindow(event), {
      title: 'Choose your booking CSV',
      properties: ['openFile'],
      filters: CSV_FILTERS,
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // Several band files at once (multi-band mode's "Import band files…").
  ipcMain.handle('dialog:pickCsvOpenMany', async (event, title) => {
    const r = await dialog.showOpenDialog(parentWindow(event), {
      title: title || 'Choose band files',
      properties: ['openFile', 'multiSelections'],
      filters: CSV_FILTERS,
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('dialog:pickCsvSave', async (event, defaultName, title) => {
    const r = await dialog.showSaveDialog(parentWindow(event), {
      title: title || 'Create a booking CSV',
      defaultPath: defaultName || 'booking.csv',
      filters: CSV_FILTERS,
    })
    return r.canceled ? null : r.filePath
  })

  // → { text, mtimeMs }. mtimeMs is the conflict-guard token handed back on save.
  ipcMain.handle('storage:readCsvFile', async (_e, path) => {
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (e) {
      // Code in the message for the same reason as CSV_CONFLICT below: the
      // renderer offers to recreate or replace the file instead of a raw ENOENT.
      if (e.code === 'ENOENT') throw new Error(`CSV_MISSING: ${path} no longer exists.`)
      throw e
    }
    return { text, mtimeMs: await mtimeOf(path) }
  })

  // expectedMtimeMs: the mtime the renderer last read. If the file changed under
  // us (another device via iCloud, the webapp, OpenClaw) we refuse and let the
  // UI ask the user what to do.
  ipcMain.handle('storage:writeCsvFile', async (_e, { path, text, expectedMtimeMs, force = false }) => {
    const current = await mtimeOf(path)
    if (!force && expectedMtimeMs != null && current != null && current !== expectedMtimeMs) {
      // The code is embedded in the message on purpose: Electron flattens a
      // thrown Error to its message across the IPC bridge, so a .code property
      // would not survive.
      throw new Error('CSV_CONFLICT: the file changed on disk since it was loaded.')
    }
    await atomicWrite(path, text)
    return { mtimeMs: await mtimeOf(path) }
  })

  ipcMain.handle('storage:readCsvFiles', (_e, paths) => readCsvFiles(paths))
  ipcMain.handle('storage:writeCsvFiles', (_e, args) => writeCsvFiles(args))
  ipcMain.handle('storage:moveFile', (_e, args) => moveFile(args))
  ipcMain.handle('storage:listCsvFiles', (_e, dir) => listCsvFiles(dir))
  ipcMain.handle('storage:fileExists', async (_e, path) => (await mtimeOf(path)) != null)

  // Export = "write a copy wherever you like", so it always asks.
  ipcMain.handle('storage:exportCsv', async (event, text, defaultName) => {
    const r = await dialog.showSaveDialog(parentWindow(event), {
      title: 'Export CSV',
      defaultPath: defaultName || 'booking.csv',
      filters: CSV_FILTERS,
    })
    if (r.canceled) return null
    await atomicWrite(r.filePath, text)
    return r.filePath
  })

  // Start a brand-new booking file: just the canonical header row.
  ipcMain.handle('storage:createCsvFile', async (_e, path) => {
    await atomicWrite(path, `${APP_COLUMNS.map(c => c.key).join(';')}\n`)
    return { mtimeMs: await mtimeOf(path) }
  })
}
