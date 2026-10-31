import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIELD_LABELS } from '@core/constants'
import de from '../de'

// Every text the app translates must have a German entry, and every German
// entry must still be used somewhere. Texts are found as
//  - literal t('…') calls, in the renderer and in core, and
//  - label / hint / unit / title / desc properties in the tables components
//    translate on display (t(s.label)) — plus the column labels.
const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const dirs = ['src/renderer/src', 'src/core']

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (name === '__tests__' || name === 'de.js') return []
    if (statSync(p).isDirectory()) return files(p)
    return /\.(jsx?|mjs)$/.test(name) ? [p] : []
  })
}
const sources = dirs.flatMap(d => files(join(root, d))).map(p => [p, readFileSync(p, 'utf8')])
const unescape = s => s.replace(/\\(['"`\\])/g, '$1')

export function usedTexts() {
  const keys = new Set(Object.values(FIELD_LABELS))
  const call = /\bt\(\s*(['"])((?:\\.|(?!\1).)*?)\1\s*[,)]/g
  const tpl = /\bt\(\s*`((?:\\.|[^`$])*?)`\s*[,)]/g
  const prop = /\b(?:label|hint|unit|title|desc)\s*:\s*(['"])((?:\\.|(?!\1).)*?)\1/g
  for (const [, src] of sources) {
    for (const m of src.matchAll(call)) keys.add(unescape(m[2]))
    for (const m of src.matchAll(tpl)) keys.add(unescape(m[1]))
    for (const m of src.matchAll(prop)) if (/[A-Za-z]{2}/.test(m[2])) keys.add(unescape(m[2]))
  }
  return keys
}

describe('German translation', () => {
  const used = usedTexts()

  it('has an entry for every text', () => {
    const missing = [...used].filter(k => !(k in de)).sort()
    expect(missing).toEqual([])
  })

  it('has no entries nothing uses any more', () => {
    const all = sources.map(([, s]) => s).join('\n')
    const stale = Object.keys(de).filter(k => !used.has(k) && !all.includes(k)).sort()
    expect(stale).toEqual([])
  })

  it('keeps every placeholder and plural form', () => {
    const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
    const bad = Object.entries(de).filter(([en, g]) =>
      vars(en) !== vars(g) || en.includes('|') !== g.includes('|'))
    expect(bad).toEqual([])
  })
})
