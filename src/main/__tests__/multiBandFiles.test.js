import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, utimesSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// storage.js registers IPC handlers and opens dialogs, so electron is stubbed.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, dialog: {}, BrowserWindow: {} }))

const { readCsvFiles, writeCsvFiles, moveFile, listCsvFiles } = await import('../ipc/storage.js')
const { planSplit, enableMultiBand, disableMultiBand, planOpenBandFiles, openBandFiles, planNewBandSet, createNewBandSet, planImportBandFiles } = await import('../../renderer/src/lib/multiBandSwitch.js')
const { getAdapter } = await import('../../renderer/src/lib/storageAdapters.js')
const { linkVenues, isMultiBand } = await import('../../core/multiBand.js')

// The renderer reaches the file system through the preload bridge; here the
// bridge is the real main-process code, so this runs split → edit → merge
// against actual files.
globalThis.window = {
  bookingApi: {
    readCsvFile: async path => ({ text: await readFile(path, 'utf8'), mtimeMs: (await stat(path)).mtimeMs }),
    readCsvFiles,
    writeCsvFiles,
    moveFile,
    fileExists: async path => existsSync(path),
    listCsvFiles,
    createCsvFile: async path => writeFileSync(path, 'Venue;Band\n'),
  },
}

const HEADER = 'Venue;Band;City;Contact;Note;Last emailed'
const CSV = [
  HEADER,
  'Kulturfabrik;Alpha;Berlin;Anna;alpha note;01.02.26',
  'Jazzclub;;Köln;Bob;;',
  'Kulturfabrik;Beta;Berlin;Anna;beta note;',
].join('\n') + '\n'

let dir
let settings

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'booking-multiband-'))
  writeFileSync(join(dir, 'booking.csv'), CSV)
  settings = {
    storage: { adapter: 'file', filePath: join(dir, 'booking.csv') },
    bands: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }],
  }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function loadAll(s) {
  const adapter = getAdapter(s)
  const { rows } = await adapter.load()
  return { adapter, rows: linkVenues(rows.map((r, i) => ({ ...r, _idx: i }))) }
}

describe('multi-band mode on real files', () => {
  it('previews the split: a file per band (even an empty one) and one without a band', async () => {
    const plan = await planSplit(settings)
    expect(plan.files.map(f => [f.name, f.count]).sort()).toEqual([
      ['booking-Alpha.csv', 1], ['booking-Beta.csv', 1], ['booking-Gamma.csv', 0], ['booking-unassigned.csv', 1],
    ])
    expect(plan.clashes).toEqual([])
  })

  it('splits, keeps shared data in step on save, and merges back', async () => {
    settings = { ...settings, storage: await enableMultiBand(settings) }
    expect(isMultiBand(settings)).toBe(true)
    const names = readdirSync(dir).sort()
    expect(names).toContain('booking-Alpha.csv')
    expect(names.some(n => /^booking\.before-multiband-\d{4}-\d{2}-\d{2}\.csv$/.test(n))).toBe(true)
    expect(names).not.toContain('booking.csv')

    // One venue with two bands, one venue without a band.
    const { adapter, rows } = await loadAll(settings)
    expect(new Set(rows.map(r => r._venueId)).size).toBe(2)

    // A shared edit lands in both band files; a per-band field stays where it is.
    const edited = rows.map(r => (r.Venue === 'Kulturfabrik' ? { ...r, Contact: 'Anna Neu' } : r))
    await adapter.save(edited, 'test')
    expect(readFileSync(join(dir, 'booking-Alpha.csv'), 'utf8')).toContain('Kulturfabrik;Alpha;Berlin;Anna Neu;alpha note')
    expect(readFileSync(join(dir, 'booking-Beta.csv'), 'utf8')).toContain('Kulturfabrik;Beta;Berlin;Anna Neu;beta note')
    expect(readFileSync(join(dir, 'booking-Gamma.csv'), 'utf8').trim().split('\n')).toHaveLength(1)

    // Switching off: one line per band entry, band files moved into a backup.
    const reloaded = await loadAll(settings)
    const storage = await disableMultiBand(settings, reloaded.rows)
    expect(storage.filePath).toBe(join(dir, 'booking.csv'))
    const merged = readFileSync(join(dir, 'booking.csv'), 'utf8').trim().split('\n')
    expect(merged).toHaveLength(4)
    expect(merged.filter(l => l.startsWith('Kulturfabrik;'))).toHaveLength(2)
    const backup = readdirSync(dir).find(n => n.startsWith('booking-bands-backup-'))
    expect(readdirSync(join(dir, backup)).sort()).toEqual(
      ['booking-Alpha.csv', 'booking-Beta.csv', 'booking-Gamma.csv', 'booking-unassigned.csv'])
  })

  it('moves an entry to its new band’s file, creating the file for a new band', async () => {
    settings = { ...settings, storage: await enableMultiBand(settings) }
    const { adapter, rows } = await loadAll(settings)
    await adapter.save(rows.map(r => (r.Venue === 'Jazzclub' ? { ...r, Band: 'Delta' } : r)), 'test')
    expect(readFileSync(join(dir, 'booking-Delta.csv'), 'utf8')).toContain('Jazzclub;Delta;Köln')
    expect(readFileSync(join(dir, 'booking-unassigned.csv'), 'utf8')).not.toContain('Jazzclub')
    expect(adapter.manifest.files.Delta).toBe(join(dir, 'booking-Delta.csv'))
  })

  it('refuses to save over a band file that changed on disk, naming it — and writes none of them', async () => {
    settings = { ...settings, storage: await enableMultiBand(settings) }
    const { adapter, rows } = await loadAll(settings)
    const beta = join(dir, 'booking-Beta.csv')
    writeFileSync(beta, readFileSync(beta, 'utf8') + 'Extra;Beta;Hamburg;;;\n')
    const future = new Date(Date.now() + 5000)
    utimesSync(beta, future, future)
    const alphaBefore = readFileSync(join(dir, 'booking-Alpha.csv'), 'utf8')

    await expect(adapter.save(rows.map(r => ({ ...r, Note: 'changed' })), 'test')).rejects.toThrow(/CSV_CONFLICT: booking-Beta\.csv/)
    expect(readFileSync(join(dir, 'booking-Alpha.csv'), 'utf8')).toBe(alphaBefore)
  })

  it('never splits over files that already exist', async () => {
    writeFileSync(join(dir, 'booking-Alpha.csv'), 'something else')
    const plan = await planSplit(settings)
    expect(plan.clashes).toEqual(['booking-Alpha.csv'])
    await expect(enableMultiBand(settings)).rejects.toThrow(/booking-Alpha\.csv/)
    expect(readFileSync(join(dir, 'booking-Alpha.csv'), 'utf8')).toBe('something else')
    expect(existsSync(join(dir, 'booking.csv'))).toBe(true)
  })

  it('treats a missing band file as empty', async () => {
    settings = { ...settings, storage: await enableMultiBand(settings) }
    rmSync(join(dir, 'booking-Beta.csv'))
    const { missing, rows } = await getAdapter(settings).load()
    expect(missing).toEqual(['booking-Beta.csv'])
    expect(rows.map(r => r.Band).sort()).toEqual(['', 'Alpha'])
  })
})

describe('band files on another Mac', () => {
  it('opens an existing set from any one of its files, and loads it as one list', async () => {
    // This Mac splits; the "other Mac" only has the files and fresh settings.
    await enableMultiBand(settings)
    const fresh = { storage: { adapter: 'file', filePath: '' }, bands: [] }
    const plan = await planOpenBandFiles(join(dir, 'booking-Beta.csv'))
    expect(plan.base).toBe('booking')
    expect(plan.files.map(f => [f.name, f.band, f.count]).sort()).toEqual([
      ['booking-Alpha.csv', 'Alpha', 1], ['booking-Beta.csv', 'Beta', 1],
      ['booking-Gamma.csv', 'Gamma', 0], ['booking-unassigned.csv', '', 1],
    ])
    const storage = await openBandFiles(fresh, plan)
    expect(isMultiBand({ storage })).toBe(true)
    const { rows } = await loadAll({ ...fresh, storage })
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map(r => r._venueId)).size).toBe(2) // Kulturfabrik with two bands, Jazzclub
  })

  it('refuses the single CSV (or its backup) as a band file', async () => {
    await expect(planOpenBandFiles(join(dir, 'booking.csv'))).rejects.toThrow(/Import CSV/)
    await enableMultiBand(settings)
    const backup = readdirSync(dir).find(n => n.includes('before-multiband'))
    await expect(planOpenBandFiles(join(dir, backup))).rejects.toThrow(/backup/)
  })
})

describe('a new set of band files', () => {
  it('creates empty files for every band elsewhere and leaves the current CSV alone', async () => {
    const elsewhere = join(dir, 'tour2027')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(elsewhere)
    const plan = await planNewBandSet(settings, join(elsewhere, 'tour.csv'))
    expect(plan.files.map(f => f.name).sort()).toEqual(['tour-Alpha.csv', 'tour-Beta.csv', 'tour-Gamma.csv', 'tour-unassigned.csv'])
    const storage = await createNewBandSet(settings, plan)
    expect(readFileSync(join(elsewhere, 'tour-Alpha.csv'), 'utf8').trim().split('\n')).toHaveLength(1)
    expect(readFileSync(join(dir, 'booking.csv'), 'utf8')).toBe(CSV)
    const { rows } = await loadAll({ ...settings, storage })
    expect(rows).toHaveLength(0)
    // A second time into the same place is refused.
    expect((await planNewBandSet(settings, join(elsewhere, 'tour.csv'))).clashes).toHaveLength(4)
  })
})

describe('importing band files', () => {
  it('reads several files, keeping each venue on its band', async () => {
    // Band files as the app writes them: at least the six signature columns.
    const H = 'Venue;Band;City;Country;Email;Last emailed'
    writeFileSync(join(dir, 'x-Delta.csv'), `${H}\nClub Neu;;Bremen;Germany;n@x.test;\nKulturfabrik;Delta;Berlin;Germany;k@x.test;\n`)
    writeFileSync(join(dir, 'x-Epsilon.csv'), `${H}\nJazzclub;Epsilon;Köln;Germany;j@x.test;\n`)
    const plan = await planImportBandFiles([join(dir, 'x-Delta.csv'), join(dir, 'x-Epsilon.csv')])
    expect(plan.rows.map(r => `${r.Venue}/${r.Band}`)).toEqual(['Club Neu/Delta', 'Kulturfabrik/Delta', 'Jazzclub/Epsilon'])
    expect(plan.venues).toBe(3)
  })

  it('sends a file without the app\'s columns to the Import CSV wizard', async () => {
    writeFileSync(join(dir, 'foreign.csv'), 'Name,Ort\nClub,Bremen\n')
    await expect(planImportBandFiles([join(dir, 'foreign.csv')])).rejects.toThrow(/Import CSV/)
  })
})
