import { ipcMain, shell, app } from 'electron'
import { readSettings, writeSettings } from '../settingsStore.js'
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
import { registerScheduleIpc } from '../scheduler.js'

// Every renderer→main call goes through ipcMain.handle. The preload re-exposes
// exactly this list as window.bookingApi.* — the renderer never sees ipcRenderer.
export function registerIpc() {
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_e, next) => writeSettings(next))

  // Secrets only ever cross the bridge as commands and booleans, never values.
  ipcMain.handle('secrets:set', (_e, key, value) => setSecret(key, value))
  ipcMain.handle('secrets:has', (_e, key) => hasSecret(key))
  ipcMain.handle('secrets:delete', (_e, key) => deleteSecret(key))

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
  registerScheduleIpc()

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url))
}
