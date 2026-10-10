import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The only channels main is allowed to push to the renderer. Keeping this an
// explicit allowlist means `onMenu` can never be turned into a general
// ipcRenderer.on for arbitrary traffic.
const MENU_CHANNELS = ['menu:openSettings', 'menu:openTemplates']

// The complete renderer-visible API. Nothing here hands out a raw ipcRenderer,
// and no secret value ever crosses the bridge — only `has…` booleans.
const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: next => ipcRenderer.invoke('settings:set', next),

  // Secrets (keychain-backed, main-process only)
  setSecret: (key, value) => ipcRenderer.invoke('secrets:set', key, value),
  hasSecret: key => ipcRenderer.invoke('secrets:has', key),
  deleteSecret: key => ipcRenderer.invoke('secrets:delete', key),

  // Native file pickers
  pickCsvOpen: () => ipcRenderer.invoke('dialog:pickCsvOpen'),
  pickCsvSave: (defaultName, title) => ipcRenderer.invoke('dialog:pickCsvSave', defaultName, title),
  pickCsvOpenMany: title => ipcRenderer.invoke('dialog:pickCsvOpenMany', title),

  // The real path behind a <input type="file"> File. The renderer cannot get
  // this itself any more (File.path was removed), and the import wizard needs it
  // to offer "use this file as my CSV from now on".
  filePathFor: file => {
    try { return webUtils.getPathForFile(file) || '' } catch { return '' }
  },

  // Local CSV file storage
  readCsvFile: path => ipcRenderer.invoke('storage:readCsvFile', path),
  writeCsvFile: args => ipcRenderer.invoke('storage:writeCsvFile', args),
  createCsvFile: path => ipcRenderer.invoke('storage:createCsvFile', path),
  // Multi-band mode: the band files as one set.
  readCsvFiles: paths => ipcRenderer.invoke('storage:readCsvFiles', paths),
  writeCsvFiles: args => ipcRenderer.invoke('storage:writeCsvFiles', args),
  moveFile: args => ipcRenderer.invoke('storage:moveFile', args),
  fileExists: path => ipcRenderer.invoke('storage:fileExists', path),
  listCsvFiles: dir => ipcRenderer.invoke('storage:listCsvFiles', dir),
  exportCsv: (text, defaultName) => ipcRenderer.invoke('storage:exportCsv', text, defaultName),

  // GitHub storage
  githubFetchCsv: args => ipcRenderer.invoke('github:fetchCsv', args),
  githubPushCsv: args => ipcRenderer.invoke('github:pushCsv', args),

  // Email templates
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  getTemplate: id => ipcRenderer.invoke('templates:get', id),
  saveTemplate: template => ipcRenderer.invoke('templates:save', template),
  deleteTemplate: id => ipcRenderer.invoke('templates:delete', id),
  saveTemplateAsset: args => ipcRenderer.invoke('templates:saveAsset', args),
  fetchVideoThumb: url => ipcRenderer.invoke('templates:fetchVideoThumb', url),

  // Apple Mail drafts
  testMailConnection: accountId => ipcRenderer.invoke('mail:testConnection', accountId),
  verifySmtp: accountId => ipcRenderer.invoke('mail:verifySmtp', accountId),
  appendDraft: args => ipcRenderer.invoke('mail:appendDraft', args),
  articleAvailability: () => ipcRenderer.invoke('articles:availability'),
  resolveGenders: names => ipcRenderer.invoke('articles:resolve', names),
  setGenderOverride: (name, gender) => ipcRenderer.invoke('articles:override', name, gender),
  syncMail: rows => ipcRenderer.invoke('mail:sync', rows),
  sendMail: args => ipcRenderer.invoke('mail:send', args),
  appleScriptDraft: args => ipcRenderer.invoke('mail:appleScriptDraft', args),
  appleScriptCheck: () => ipcRenderer.invoke('mail:appleScriptCheck'),

  // Geocoding (Nominatim needs a User-Agent the renderer may not set)
  geocode: (city, country) => ipcRenderer.invoke('geo:geocode', city, country),
  geoCacheSnapshot: () => ipcRenderer.invoke('geo:cacheSnapshot'),

  // Updates (compare against the latest GitHub release; nothing self-installs)
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Scheduled bulk runs (drafts and/or sends at a chosen time)
  listScheduledRuns: () => ipcRenderer.invoke('schedule:list'),
  scheduleRun: spec => ipcRenderer.invoke('schedule:add', spec),
  cancelScheduledRun: id => ipcRenderer.invoke('schedule:cancel', id),
  // The renderer executes repeating runs (it knows the current venues) and
  // reports the outcome back; `deferred` puts the job back in the queue.
  reportScheduledRun: (id, payload) => ipcRenderer.invoke('schedule:report', id, payload),

  openExternal: url => ipcRenderer.invoke('app:openExternal', url),

  // Menu → renderer. Returns an unsubscribe function for use in a useEffect.
  onMenu: (channel, cb) => {
    if (!MENU_CHANNELS.includes(channel)) return () => {}
    const handler = () => cb()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // "Check for Updates…" found a newer release: the window shows its banner.
  onUpdateAvailable: cb => {
    const handler = (_e, result) => cb(result)
    ipcRenderer.on('updates:available', handler)
    return () => ipcRenderer.removeListener('updates:available', handler)
  },

  // The scheduler in main reports back here: a run fired, or the queue changed.
  // Same one-channel-per-purpose rule as onMenu — no general subscribe.
  onScheduleUpdate: cb => {
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('schedule:updated', handler)
    return () => ipcRenderer.removeListener('schedule:updated', handler)
  },
}

contextBridge.exposeInMainWorld('bookingApi', api)
