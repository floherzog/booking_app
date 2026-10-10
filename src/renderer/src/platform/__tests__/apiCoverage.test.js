import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { api as webApi, caps as webCaps, UNSUPPORTED } from '../web'
import { caps as macCaps } from '../electron'

// The guard that keeps the two builds honest. Every method the Mac preload
// exposes must be answered by the web build: implemented, or listed in
// UNSUPPORTED with a capability that is off on the web (so the UI hides every
// path to it) and on in the Mac app. A new IPC call fails this test until the
// web side decides what it does with it.
function preloadMethods() {
  const src = readFileSync(resolve(process.cwd(), 'src/preload/index.js'), 'utf8')
  const block = src.slice(src.indexOf('const api = {'), src.indexOf('contextBridge.exposeInMainWorld'))
  return [...block.matchAll(/^ {2}(\w+):/gm)].map(m => m[1])
}

describe('platform seam', () => {
  const methods = preloadMethods()

  it('finds the preload api', () => {
    expect(methods.length).toBeGreaterThan(30)
    expect(methods).toContain('getSettings')
  })

  it.each(methods)('web build answers %s', name => {
    expect(typeof webApi[name]).toBe('function')
  })

  it.each(Object.entries(UNSUPPORTED))('%s is hidden behind caps.%s', (name, cap) => {
    expect(methods).toContain(name)
    expect(cap in webCaps).toBe(true)
    expect(webCaps[cap]).toBe(false)
    expect(macCaps[cap]).toBe(true)
  })

  it('both builds declare the same capabilities', () => {
    expect(Object.keys(webCaps).sort()).toEqual(Object.keys(macCaps).sort())
  })

  it('unsupported methods reject instead of pretending to work', async () => {
    await expect(webApi.sendMail({})).rejects.toThrow(/not available in the web app/)
  })
})
