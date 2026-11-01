import { describe, it, expect } from 'vitest'
import { stampChanges, stampAll, mergeSynced, SYNCED } from '@core/settingsSync'

const T1 = '2026-11-01T10:00:00.000Z'
const T2 = '2026-11-01T11:00:00.000Z'

describe('stampChanges', () => {
  it('stamps only the synced sections that changed', () => {
    const prev = { bands: [{ name: 'A' }], rules: { batchSize: 10 }, mail: { accounts: [] }, syncStamps: { rules: T1 } }
    const next = { ...prev, bands: [{ name: 'B' }], mail: { accounts: [{ id: 'x' }] } }
    expect(stampChanges(prev, next, T2).syncStamps).toEqual({ rules: T1, bands: T2 })
  })
  it('sees a new CSV location in storage.github', () => {
    const prev = { storage: { adapter: 'file', filePath: '/a.csv', github: { repo: '', path: '' } } }
    const moved = { storage: { ...prev.storage, filePath: '/b.csv' } }
    expect(stampChanges(prev, moved, T2).syncStamps).toEqual({})
    const gh = { storage: { ...prev.storage, github: { repo: 'me/list', path: 'x.csv' } } }
    expect(stampChanges(prev, gh, T2).syncStamps).toEqual({ csvLocation: T2 })
  })
})

describe('mergeSynced', () => {
  it('takes each section from the side that changed it last', () => {
    const local = { bands: ['mac'], rules: { n: 1 }, syncStamps: { bands: T2, rules: T1 } }
    const remote = { bands: ['web'], rules: { n: 2 }, syncStamps: { bands: T1, rules: T2 } }
    const m = mergeSynced(local, remote)
    expect(m.local.rules).toEqual({ n: 2 })
    expect(m.remote.bands).toEqual(['mac'])
    expect(m.changedLocal && m.changedRemote).toBe(true)
    expect(m.local.syncStamps).toEqual({ bands: T2, rules: T2 })
    expect(m.remote.syncStamps).toEqual(m.local.syncStamps)
  })
  it('takes a section stamped on one side only, and leaves unstamped ones alone', () => {
    const m = mergeSynced({ bands: ['mac'], rules: { n: 1 } }, { bands: ['web'], rules: { n: 2 }, syncStamps: { rules: T1 } })
    expect(m.local).toMatchObject({ bands: ['mac'], rules: { n: 2 } })
    expect(m.remote.bands).toEqual(['web'])
  })
  it('reports nothing when both sides agree', () => {
    const s = stampAll({ bands: ['a'] }, T1)
    const m = mergeSynced(s, { ...s })
    expect(m.changedLocal || m.changedRemote).toBe(false)
  })
  it('never carries unsynced keys across', () => {
    const local = stampAll({ mail: { accounts: [{ id: 'x' }] }, draftLog: { a: 1 }, storage: { adapter: 'file', filePath: '/me.csv', github: {} } }, T2)
    const remote = { openclaw: { repo: 'o/s' } }
    const m = mergeSynced(local, remote)
    expect(m.remote).not.toHaveProperty('mail')
    expect(m.remote).not.toHaveProperty('draftLog')
    expect(m.remote.storage?.filePath).toBeUndefined()
    expect(m.local).not.toHaveProperty('openclaw')
    expect(SYNCED).not.toContain('mail')
  })
  it('switches to the web app’s CSV only when asked to', () => {
    const local = { storage: { adapter: 'file', filePath: '/me.csv', github: { repo: '', path: '' } } }
    const remote = { storage: { adapter: 'github', github: { repo: 'me/list', path: 'x.csv' } }, syncStamps: { csvLocation: T1 } }
    expect(mergeSynced(local, remote).local.storage).toMatchObject({ adapter: 'file', github: { repo: 'me/list' } })
    expect(mergeSynced(local, remote, { adoptCsv: true }).local.storage).toMatchObject({ adapter: 'github', filePath: '/me.csv' })
  })
})
