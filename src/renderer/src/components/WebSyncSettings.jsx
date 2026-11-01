import { useState } from 'react'
import { useT } from '../i18n'
import Busy from './Busy'

// Settings ▸ General ▸ Sync with your web app (Mac only, caps.settingsSync).
// Connecting, syncing and disconnecting run in App (they replace the settings
// the panel was opened with); this only collects the address and access code
// and shows how the last sync went. See src/main/ipc/webSync.js.
export default function WebSyncSettings({ webSync = {}, multiBandOn, error, busy, onConnect, onSyncNow, onDisconnect, onUseCsv }) {
  const t = useT()
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  const message = (err, detail) => ({
    url: t('Enter the web app’s https:// address.'),
    code: t('That access code isn’t right.'),
    notBooking: t('No Booking web app answered at that address.'),
    network: t('Could not reach the web app: {message}', { message: detail || '' }),
    signin: t('The web app signed this Mac out — connect again with the access code.'),
  }[err] || '')

  async function connect(address = url) {
    setConnecting(true)
    setConnectError('')
    try {
      const r = await onConnect(address, code)
      if (r?.error) setConnectError(message(r.error, r.message))
      else if (!r?.cancelled) { setUrl(''); setCode('') }
    } finally {
      setConnecting(false)
    }
  }

  const lbl = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
  const input = 'block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'
  const outlineBtn = 'py-1.5 px-3 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors'
  const host = webSync.url ? new URL(webSync.url).host : ''
  const last = webSync.lastSyncedAt ? new Date(webSync.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
      <p className={lbl}>{t('Sync with your web app')}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        {t('Keeps rules, bands, venue types, chips, mail languages and template options the same here and in your own Booking web app — and, if you like, the CSV. Mail accounts and passwords stay on this Mac.')}
      </p>
      {webSync.url ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-800 dark:text-gray-200">
              {last ? t('Synced with {host} · last synced {time}', { host, time: last }) : t('Connected to {host}', { host })}
            </span>
            <button type="button" onClick={onSyncNow} disabled={busy} className={outlineBtn}>{busy ? <Busy label={t('Syncing…')} /> : t('Sync now')}</button>
            <button type="button" onClick={onDisconnect} disabled={busy} className={outlineBtn}>{t('Disconnect')}</button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{message(error.code, error.message)}</p>}
          {error?.code === 'signin' && (
            <div className="flex items-end gap-2">
              <div className="w-48">
                <label className={lbl}>{t('Access code')}</label>
                <input className={input} type="password" value={code} onChange={e => setCode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); connect(webSync.url) } }} />
              </div>
              <button type="button" onClick={() => connect(webSync.url)} disabled={connecting || !code} className={outlineBtn}>
                {connecting ? <Busy label={t('Connecting…')} /> : t('Connect')}
              </button>
              {connectError && <span className="text-xs text-red-600 dark:text-red-400 self-center">{connectError}</span>}
            </div>
          )}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={webSync.useCsv !== false && !multiBandOn}
              disabled={multiBandOn}
              onChange={e => onUseCsv(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('Also use the web app’s CSV')}
              <span className="block text-gray-400 dark:text-gray-500">
                {multiBandOn
                  ? t('Not in multi-band mode — band files are local.')
                  : t('This Mac then reads and saves the same GitHub CSV as the web app, with the web app’s GitHub token — unless you entered your own under Data & storage.')}
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-2">
            <div>
              <label className={lbl}>{t('Web app address')}</label>
              <input className={`${input} font-mono`} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/booking_app/" spellCheck={false} />
            </div>
            <div>
              <label className={lbl}>{t('Access code')}</label>
              <input className={input} type="password" value={code} onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); connect() } }} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => connect()} disabled={connecting || !url.trim() || !code} className={outlineBtn}>
              {connecting ? <Busy label={t('Connecting…')} /> : t('Connect')}
            </button>
            {connectError && <span className="text-xs text-red-600 dark:text-red-400">{connectError}</span>}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('The access code is the web app’s login password. Only the sign-in it hands out is kept, in the keychain.')}
          </p>
        </div>
      )}
    </div>
  )
}
