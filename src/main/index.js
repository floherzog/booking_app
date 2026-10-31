import { join } from 'node:path'
import { app, shell, dialog, BrowserWindow, Menu, protocol, net, ipcMain } from 'electron'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc/index.js'
import { checkForUpdates } from './ipc/updates.js'
import { startScheduler } from './scheduler.js'
import { tm, setMainLanguage } from './i18n.js'

const isDev = !app.isPackaged

// Development only: BOOKING_USER_DATA points the app at a scratch copy of its
// settings, templates and caches, so it can be poked at without touching the
// real ones.
if (isDev && process.env.BOOKING_USER_DATA) app.setPath('userData', process.env.BOOKING_USER_DATA)

// TipTap inline images live in userData/templates/assets and are served to the
// renderer through this scheme (a plain file:// URL is blocked by the CSP).
const ASSET_SCHEME = 'booking-asset'
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } },
])

function assetsDir() {
  return join(app.getPath('userData'), 'templates', 'assets')
}

function registerAssetProtocol() {
  protocol.handle(ASSET_SCHEME, request => {
    // booking-asset://<id> → userData/templates/assets/<id>
    const url = new URL(request.url)
    const name = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/\/+$/, '')
    // Never let a crafted id escape the assets directory.
    if (!name || name.includes('..') || name.includes('/')) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(assetsDir(), name)).toString())
  })
}

// Menu items act on whichever window is in front; the menu is built once, before
// any window exists, so the lookup has to happen at click time.
function currentWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function sendToRenderer(channel) {
  currentWindow()?.webContents.send(channel)
}

// "Check for Updates…" — nothing installs itself; we compare against the latest
// GitHub release. Up to date or unreachable gets a short dialog (the user asked);
// a newer release is shown in the window's update banner.
async function promptForUpdate({ preloaded = null } = {}) {
  const parent = currentWindow()
  const result = preloaded || await checkForUpdates({ currentVersion: app.getVersion() })

  if (result.error) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      message: tm('Could not check for updates'),
      detail: result.error,
      buttons: [tm('OK')],
    })
    return
  }

  if (!result.newer) {
    await dialog.showMessageBox(parent, {
      type: 'info',
      message: tm('Booking {version} is up to date.', { version: result.current }),
      detail: tm('The latest published release is {version}.', { version: result.latest }),
      buttons: [tm('OK')],
    })
    return
  }

  // Something newer: the window's banner says so (with Download and What's
  // new), rather than a dialog that has to be dismissed.
  parent?.webContents.send('updates:available', result)
}

function buildMenu() {
  // Built-in items get labels too: Electron only names them in English.
  const name = { name: app.name }
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: tm('About {name}', name) },
        { type: 'separator' },
        { label: tm('Check for Updates…'), click: () => { promptForUpdate() } },
        { type: 'separator' },
        { label: tm('Settings…'), accelerator: 'CmdOrCtrl+,', click: () => sendToRenderer('menu:openSettings') },
        { type: 'separator' },
        { role: 'services', label: tm('Services') },
        { type: 'separator' },
        { role: 'hide', label: tm('Hide {name}', name) },
        { role: 'hideOthers', label: tm('Hide Others') },
        { role: 'unhide', label: tm('Show All') },
        { type: 'separator' },
        { role: 'quit', label: tm('Quit {name}', name) },
      ],
    },
    {
      label: tm('File'),
      submenu: [
        { label: tm('Email Templates…'), accelerator: 'CmdOrCtrl+T', click: () => sendToRenderer('menu:openTemplates') },
        { type: 'separator' },
        { role: 'close', label: tm('Close Window') },
      ],
    },
    // Required: without a real Edit menu ⌘C/⌘V/⌘Z do nothing in the renderer.
    {
      label: tm('Edit'),
      submenu: [
        { role: 'undo', label: tm('Undo') },
        { role: 'redo', label: tm('Redo') },
        { type: 'separator' },
        { role: 'cut', label: tm('Cut') },
        { role: 'copy', label: tm('Copy') },
        { role: 'paste', label: tm('Paste') },
        { role: 'pasteAndMatchStyle', label: tm('Paste and Match Style') },
        { role: 'delete', label: tm('Delete') },
        { role: 'selectAll', label: tm('Select All') },
      ],
    },
    {
      label: tm('View'),
      submenu: [
        { role: 'reload', label: tm('Reload') },
        { role: 'forceReload', label: tm('Force Reload') },
        { role: 'toggleDevTools', label: tm('Toggle Developer Tools') },
        { type: 'separator' },
        { role: 'resetZoom', label: tm('Actual Size') },
        { role: 'zoomIn', label: tm('Zoom In') },
        { role: 'zoomOut', label: tm('Zoom Out') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: tm('Toggle Full Screen') },
      ],
    },
    {
      label: tm('Window'),
      role: 'window',
      submenu: [
        { role: 'minimize', label: tm('Minimize') },
        { role: 'zoom', label: tm('Zoom') },
        { type: 'separator' },
        { role: 'front', label: tm('Bring All to Front') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Booking',
    // A standard title bar, on purpose. With `hiddenInset` the only draggable
    // area is the thin strip the renderer happens to leave free, and every
    // `fixed inset-0` modal covers it — the window then reads as immovable.
    titleBarStyle: 'default',
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
    // The automatic update check runs in the window (App.jsx) once settings
    // have loaded, so its banner can never miss a message sent too early.
  })

  // In dev, surface renderer console output on the terminal so a headless run
  // (or a run behind the window) still shows errors.
  if (isDev) {
    win.webContents.on('console-message', e => {
      console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[renderer gone]', details)
    })
  }

  // Anything that wants a new window (target=_blank, window.open) opens in the
  // user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerAssetProtocol()
  registerIpc()
  // The window says which language it speaks; the menu follows.
  ipcMain.handle('app:setLanguage', (_e, lang) => { setMainLanguage(lang); buildMenu() })
  buildMenu()
  createWindow()
  // Scheduled runs only fire while the app is open; this also picks up any that
  // came due while it was closed.
  startScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
