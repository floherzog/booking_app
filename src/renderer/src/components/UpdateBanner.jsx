import { useEffect, useState } from 'react'
import { api } from '../platform'
import { t, useT } from '../i18n'

// A newer release, said once at the top of the window instead of in a dialog
// that has to be dismissed before anything else works. Download fetches the
// .dmg for this Mac inside the app, with a progress bar, into Downloads — free
// of the quarantine mark a browser download carries, so it needs no Terminal
// step — and then offers to open it. Should that fail, the browser download is
// still a click away. What's new opens the release notes. × hides it for this
// version — the next one shows again.
export default function UpdateBanner({ update, onDismiss }) {
  const t = useT()
  // idle → downloading → done | failed
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState({ received: 0, total: 0 })
  const [result, setResult] = useState(null)
  useEffect(() => api.onUpdateProgress(setProgress), [])
  if (!update?.newer) return null

  const open = url => api.openExternal(url)
  const link = 'font-medium text-indigo-700 dark:text-indigo-300 hover:underline'
  const browserDownload = () => open(update.downloadUrl || update.url)

  async function download() {
    if (!update.download) return browserDownload()
    setPhase('downloading')
    setProgress({ received: 0, total: update.download.size || 0 })
    const r = await api.downloadUpdate()
    if (r?.cancelled) return setPhase('idle')
    setResult(r)
    setPhase(r?.error ? 'failed' : 'done')
  }

  const pct = progress.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const mb = n => `${(n / 1048576).toFixed(0)} MB`

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 shadow-lg text-sm">
      <div className="flex items-center gap-3 pl-4 pr-2 py-2.5">
        <span className="text-indigo-900 dark:text-indigo-100 min-w-0">
          {phase === 'downloading' ? (
            <>{t("Downloading")} <span className="font-semibold">Booking {update.latest}</span>
              <span className="text-indigo-700/70 dark:text-indigo-300/70"> · {pct != null ? `${pct} %` : mb(progress.received)}</span></>
          ) : phase === 'done' ? (
            <><span className="font-semibold">Booking {update.latest}</span> {t("is in Downloads")}
              <span className="text-indigo-700/70 dark:text-indigo-300/70"> {t("· open it and drag Booking into Applications")}</span></>
          ) : phase === 'failed' ? (
            <span className="text-red-700 dark:text-red-300">{t("Download failed:")} {result?.error}</span>
          ) : (
            <><span className="font-semibold">Booking {update.latest}</span> {t("is available")}
              <span className="text-indigo-700/70 dark:text-indigo-300/70"> {t("· you have")} {update.current}</span></>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3 shrink-0">
          {phase === 'idle' && <button onClick={download} className={link}>{t("Download")}</button>}
          {phase === 'downloading' && <button onClick={() => api.cancelUpdateDownload()} className={link}>{t("Cancel")}</button>}
          {phase === 'done' && (
            <>
              <button onClick={() => api.openUpdate()} className={link}>{t("Open")}</button>
              <button onClick={() => api.revealUpdate()} className={link}>{t("Show in Finder")}</button>
            </>
          )}
          {phase === 'failed' && (
            <>
              <button onClick={download} className={link}>{t("Try again")}</button>
              <button onClick={browserDownload} className={link}>{t("Download in browser")}</button>
            </>
          )}
          {phase !== 'downloading' && phase !== 'done' && (
            <button onClick={() => open(update.url)} className={link}>{t("What’s new")}</button>
          )}
          {phase !== 'downloading' && (
            <button
              onClick={onDismiss}
              aria-label={t("Dismiss")}
              title={t("Hide until the next version")}
              className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 text-lg leading-none px-1.5"
            >
              &times;
            </button>
          )}
        </span>
      </div>
      {phase === 'downloading' && (
        <div className="mx-4 mb-2.5 h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900 overflow-hidden">
          <div
            className={`h-full bg-indigo-600 dark:bg-indigo-400 transition-[width] duration-200 ${pct == null ? 'w-1/3 animate-pulse' : ''}`}
            style={pct != null ? { width: `${pct}%` } : undefined}
          />
        </div>
      )}
      {phase === 'done' && result && !result.quarantineCleared && (
        <p className="px-4 pb-2.5 text-xs text-indigo-800 dark:text-indigo-200">
          {t("macOS still has this file marked as downloaded from the internet. Before opening it, run in Terminal:")}{' '}
          <code className="font-mono select-all">xattr -dr com.apple.quarantine ~/Downloads/"{result.name}"</code>
        </p>
      )}
    </div>
  )
}
