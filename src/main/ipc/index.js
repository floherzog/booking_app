import { ipcMain, shell, app } from 'electron'
import { readSettings, writeSettings, patchSettings } from '../settingsStore.js'
import { setSecret, hasSecret, deleteSecret } from '../secrets.js'
import { registerStorageIpc } from './storage.js'
import { registerGithubIpc } from './github.js'
import { registerGeocacheIpc } from './geocache.js'
import { registerTemplatesIpc } from './templates.js'
import { registerMailImapIpc } from './mailImap.js'
import { registerMailSmtpIpc } from './mailSmtp.js'
import { registerMailSyncIpc } from './mailSync.js'
import { registerArticlesIpc } from './articles.js'
import { registerMailAppleScriptIpc } from './mailAppleScript.js'
import { registerUpdatesIpc } from './updates.js'
import { registerWebSyncIpc } from './webSync.js'
import { registerMailHistoryIpc } from './mailHistory.js'
import { registerScheduleIpc } from '../scheduler.js'

// Every renderer→main call goes through ipcMain.handle. The preload re-exposes
// exactly this list as window.bookingApi.* — the renderer never sees ipcRenderer.
export function registerIpc() {
  ipcMain.handle('settings:get', () => readSettings())
  // webSync belongs to ipc/webSync.js (address, sign-in, where the token came
  // from); the renderer may only switch "Also use the web app's CSV", so an
  // older copy of the settings in the window can't undo a connect or a token.
  ipcMain.handle('settings:set', (_e, next) => {
    const kept = readSettings().webSync
    const useCsv = typeof next?.webSync?.useCsv === 'boolean' ? next.webSync.useCsv : kept.useCsv
    return writeSettings({ ...next, webSync: { ...kept, useCsv } })
  })

  // Secrets only ever cross the bridge as commands and booleans, never values.
  // A GitHub token typed in (or forgotten) here is your own from then on, so a
  // settings sync no longer replaces it with the web app's (ipc/webSync.js).
  const ownToken = key => {
    const s = readSettings()
    if (key === 'githubToken' && s.webSync?.tokenFromWeb) patchSettings({ webSync: { ...s.webSync, tokenFromWeb: false } })
  }
  ipcMain.handle('secrets:set', (_e, key, value) => { const r = setSecret(key, value); ownToken(key); return r })
  ipcMain.handle('secrets:has', (_e, key) => hasSecret(key))
  ipcMain.handle('secrets:delete', (_e, key) => { const r = deleteSecret(key); ownToken(key); return r })

  registerStorageIpc()
  registerGithubIpc()
  registerGeocacheIpc()
  registerTemplatesIpc()
  registerMailImapIpc()
  registerMailSmtpIpc()
  registerMailSyncIpc()
  registerArticlesIpc()
  registerMailAppleScriptIpc()
  registerUpdatesIpc()
  registerWebSyncIpc()
  registerMailHistoryIpc()
  registerScheduleIpc()

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url))
}
