import { describe, it, expect, afterEach } from 'vitest'
import { api, cleanIpcError } from '../electron.js'

afterEach(() => { delete globalThis.window })

describe('electron api', () => {
  it('drops Electron\'s "Error invoking remote method" prefix from a failed call', async () => {
    globalThis.window = {
      bookingApi: {
        testMailConnection: () => Promise.reject(new Error("Error invoking remote method 'mail:testConnection': Error: Google rejected that password.")),
      },
    }
    await expect(api.testMailConnection('a')).rejects.toThrow(/^Google rejected that password\.$/)
  })

  it('passes results, non-promise returns and other errors through unchanged', async () => {
    const unsubscribe = () => {}
    globalThis.window = { bookingApi: { ok: () => Promise.resolve(42), on: () => unsubscribe, flag: true } }
    await expect(api.ok()).resolves.toBe(42)
    expect(api.on()).toBe(unsubscribe)
    expect(api.flag).toBe(true)
    expect(api.missing).toBeUndefined()
    const other = new Error('plain')
    expect(cleanIpcError(other)).toBe(other)
  })
})
