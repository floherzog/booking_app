// The Mac build: everything goes through the preload bridge (src/preload/index.js)
// and every capability is there. Resolved through the `@platform` alias, so the
// web build never bundles this file and this build never bundles web.js.
// Looked up on each use rather than captured at import, so modules that import
// it can still be loaded (and tested) where there is no preload.
//
// A failed ipcRenderer.invoke arrives as "Error invoking remote method
// 'mail:testConnection': Error: <message>"; only the message is for the user.
const IPC_PREFIX = /^Error invoking remote method '[^']*': (?:\w*Error: )?/
export function cleanIpcError(e) {
  return e?.message && IPC_PREFIX.test(e.message) ? new Error(e.message.replace(IPC_PREFIX, '')) : e
}

export const api = new Proxy({}, {
  get: (_target, name) => {
    const fn = globalThis.window?.bookingApi?.[name]
    if (typeof fn !== 'function') return fn
    return (...args) => {
      const r = fn(...args)
      return typeof r?.then === 'function' ? r.catch(e => { throw cleanIpcError(e) }) : r
    }
  },
})

export const caps = {
  platform: 'mac',
  localFiles: true,      // CSV files on disk, native pickers, "New, empty CSV" in place
  multiBand: true,       // one CSV per band (needs local files)
  mail: true,            // templates, drafts, sending, mail sync, scheduled runs
  articles: true,        // {{article}} from Apple's on-device model
  updates: true,         // GitHub-release update check and banner
  storageChoice: true,   // local file or GitHub; the web build is GitHub only
  openclawPolicy: false, // warn when OpenClaw's hold logic drifts from the rules
}
