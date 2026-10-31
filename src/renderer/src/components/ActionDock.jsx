// The two things done to many venues at once, in one place at the bottom
// right: picking venues (Select) and writing to them (Email — drafts or sends,
// through the bulk dialog). In Select mode, Email writes to the venues picked.
// The web build has no mail, so there it is Select alone.
export default function ActionDock({ selectMode, selectedCount, canSelect = true, onToggleSelect, onEmail }) {
  const half = 'px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
  return (
    <div className="fixed bottom-4 right-4 z-[1010] flex rounded-full shadow-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden bg-white dark:bg-gray-800">
      {canSelect && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selectMode}
          title={selectMode ? 'Leave Select mode' : 'Pick venues: click rows, shift-click a range, or drag across them'}
          className={`${half} hidden sm:inline-flex items-center gap-1.5 ${selectMode
            ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" rx="2.5" />
            {selectMode && <path d="M5 8.2l2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {selectMode ? `Done${selectedCount ? ` (${selectedCount})` : ''}` : 'Select'}
        </button>
      )}
      {onEmail && (
        <button
          type="button"
          onClick={onEmail}
          title={selectMode && selectedCount
            ? `Draft or send to the ${selectedCount} selected venue${selectedCount !== 1 ? 's' : ''}`
            : 'Draft or send to several venues: the next batch, follow-ups, or what the filters show'}
          className={`${half} inline-flex items-center gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 ${canSelect ? 'sm:border-l sm:border-indigo-700' : ''}`}
        >
          <span aria-hidden="true">✉</span>
          Email{selectMode && selectedCount ? ` ${selectedCount}` : ''}
        </button>
      )}
    </div>
  )
}
