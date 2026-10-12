import { api } from '../platform'

// A newer release, said once at the top of the window instead of in a dialog
// that has to be dismissed before anything else works. Download fetches the
// .dmg for this Mac (or the release page when there is none); What's new opens
// the release notes. × hides it for this version — the next one shows again.
export default function UpdateBanner({ update, onDismiss }) {
  if (!update?.newer) return null
  const open = url => api.openExternal(url)
  const link = 'font-medium text-indigo-700 dark:text-indigo-300 hover:underline'
  return (
    <div className="flex items-center gap-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 shadow-lg pl-4 pr-2 py-2.5 text-sm">
      <span className="text-indigo-900 dark:text-indigo-100 min-w-0">
        <span className="font-semibold">Booking {update.latest}</span> is available
        <span className="text-indigo-700/70 dark:text-indigo-300/70"> · you have {update.current}</span>
      </span>
      <span className="ml-auto flex items-center gap-3 shrink-0">
        <button onClick={() => open(update.downloadUrl || update.url)} className={link}>Download</button>
        <button onClick={() => open(update.url)} className={link}>What’s new</button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Hide until the next version"
          className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 text-lg leading-none px-1.5"
        >
          &times;
        </button>
      </span>
    </div>
  )
}
