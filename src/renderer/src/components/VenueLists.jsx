import { useState } from 'react'
import { api, caps } from '../platform'
import { useT } from '../i18n'
import { listsOf, listLabel, listUsable, newListId } from '@core/storageLists'

// Settings ▸ Data & storage: the venue lists, folded like the mail accounts.
// One is shown (switched at the top left of the window); its card holds the
// usual source settings (`shownBody`). The others are named and pointed at a
// file or a GitHub repo here, and shown from here or from the switch.
export default function VenueLists({ storage, onChange, onShow, shownBody, blocked, lbl, monoInput, outlineBtn }) {
  const t = useT()
  const { lists, active } = listsOf(storage)
  const [open, setOpen] = useState(lists.length > 1 ? null : active)
  const [error, setError] = useState('')

  const put = next => onChange({ ...storage, lists: next, active })
  const patch = (id, p) => put(lists.map(l => (l.id === id ? { ...l, ...p } : l)))

  function add() {
    const id = newListId(lists)
    put([...lists, { id, name: '', adapter: caps.storageChoice ? 'file' : 'github', filePath: '', github: { repo: '', path: '' } }])
    setOpen(id)
  }
  async function chooseFor(id) {
    const picked = await api.pickCsvOpen()
    if (picked) patch(id, { filePath: picked })
  }
  async function newFileFor(id) {
    setError('')
    try {
      const picked = await api.pickCsvSave('booking.csv')
      if (!picked) return
      await api.createCsvFile(picked)
      patch(id, { filePath: picked })
    } catch (e) {
      setError(e.message)
    }
  }

  const where = l => (l.adapter === 'github'
    ? (l.github.repo && l.github.path ? `${l.github.repo} · ${l.github.path}` : t('GitHub not configured'))
    : (l.filePath || t('No file chosen')))

  return (
    <div className="space-y-2">
      {lists.map(l => {
        const shown = l.id === active
        const isOpen = open === l.id
        const usable = listUsable(l, { localFiles: caps.localFiles })
        return (
          <div key={l.id} className={`rounded-lg border ${shown ? 'border-indigo-300 dark:border-indigo-700' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center gap-2 pr-2">
              <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}
                className="flex-1 min-w-0 flex items-center justify-between gap-3 px-3 py-2 text-left">
                <span className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {listLabel(l, t)}
                    {shown && lists.length > 1 && <span className="ml-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">{t('shown')}</span>}
                  </span>
                  <span className="block text-xs text-gray-400 dark:text-gray-500 truncate font-mono">{where(l)}</span>
                </span>
                <span className="text-gray-400 shrink-0">{isOpen ? '▴' : '▾'}</span>
              </button>
              {!shown && (
                <>
                  <button type="button" onClick={() => onShow(l.id)} disabled={!usable || !!blocked}
                    title={blocked || (!usable ? t('Choose where this list is first') : t('Show this list instead'))}
                    className="shrink-0 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:underline disabled:opacity-40 disabled:no-underline px-1">
                    {t('Show')}
                  </button>
                  <button type="button" onClick={() => { put(lists.filter(x => x.id !== l.id)); if (isOpen) setOpen(null) }}
                    title={t('Remove this list (the file stays where it is)')}
                    className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded transition-colors">
                    &times;
                  </button>
                </>
              )}
            </div>
            {isOpen && (
              <div className="px-3 pb-3 pt-3 space-y-3 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <label className={lbl}>{t('Name')}</label>
                  <input className={monoInput.replace('font-mono', '')} value={l.name} placeholder={listLabel({ ...l, name: '' }, t)}
                    onChange={e => patch(l.id, { name: e.target.value })} />
                </div>
                {shown ? shownBody : (
                  <>
                    {caps.storageChoice && (
                      <div className="flex gap-4">
                        {[['file', t('Local CSV file')], ['github', t('GitHub repository')]].map(([v, label]) => (
                          <label key={v} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
                            <input type="radio" name={`list-adapter-${l.id}`} checked={l.adapter === v} onChange={() => patch(l.id, { adapter: v })}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                            {label}
                          </label>
                        ))}
                      </div>
                    )}
                    {l.adapter === 'github' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={lbl}>{t('Repository (owner/name)')}</label>
                          <input className={monoInput} value={l.github.repo} placeholder={t('you/booking_list')}
                            onChange={e => patch(l.id, { github: { ...l.github, repo: e.target.value } })} />
                        </div>
                        <div>
                          <label className={lbl}>{t('File path in the repo')}</label>
                          <input className={monoInput} value={l.github.path} placeholder={t('data/booking.csv')}
                            onChange={e => patch(l.id, { github: { ...l.github, path: e.target.value } })} />
                        </div>
                        <p className="col-span-2 text-xs text-gray-400 dark:text-gray-500">{t('Uses the same GitHub token as your other lists.')}</p>
                      </div>
                    ) : caps.localFiles ? (
                      <div>
                        <label className={lbl}>{t('CSV file')}</label>
                        <div className="flex gap-2 items-center">
                          <input className={`${monoInput} flex-1`} value={l.filePath} readOnly placeholder={t('No file chosen')} />
                          <button type="button" onClick={() => chooseFor(l.id)} className={`${outlineBtn} shrink-0`}>{t('Choose…')}</button>
                          <button type="button" onClick={() => newFileFor(l.id)} className={`${outlineBtn} shrink-0`} title={t('A new, empty CSV for this list')}>{t('New file…')}</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t('This list is a file on a Mac — the web app can’t open it.')}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => onShow(l.id)} disabled={!usable || !!blocked} className={outlineBtn}>{t('Show this list')}</button>
                      {blocked && <span className="text-xs text-amber-600 dark:text-amber-400">{blocked}</span>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" onClick={add} className={outlineBtn}>{t('+ Add list')}</button>
      {lists.length > 1 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t('One list is shown at a time — switch at the top left, next to the venue count. Bands, templates, rules and mail are the same for every list.')}
        </p>
      )}
    </div>
  )
}
