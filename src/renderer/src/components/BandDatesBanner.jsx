import { useState } from 'react'
import { t, useT } from '../i18n'

// Venues whose Dates don't match their band's Dates (Settings ▸ Bands), said at
// the top of the window like a new release. Fill takes the band's dates into
// the empty ones, Overwrite into the differing ones — both as unsaved edits
// that reach the CSV through Save. Keep leaves one venue on its own dates for
// good; × hides the notice until the set of venues changes.
export default function BandDatesBanner({ gaps, onApply, onOpenVenue, onKeep, onDismiss }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { missing, mismatch } = gaps
  if (!missing.length && !mismatch.length) return null

  const link = 'font-medium text-amber-800 dark:text-amber-300 hover:underline whitespace-nowrap'
  const parts = [
    missing.length > 0 && t('{n} empty', { n: missing.length }),
    mismatch.length > 0 && t('{n} different', { n: mismatch.length }),
  ].filter(Boolean)

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 shadow-lg text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 pr-2 py-2.5">
        <span className="text-amber-900 dark:text-amber-100 min-w-0">
          <span className="font-semibold">{t("Dates")}</span> {t("not matching their band’s Dates")}
          <span className="text-amber-700/70 dark:text-amber-300/70"> · {parts.join(', ')}</span>
        </span>
        <span className="ml-auto flex items-center gap-3 shrink-0">
          {missing.length > 0 && <button onClick={() => onApply(missing)} className={link}>{t("Fill")} {missing.length}</button>}
          {mismatch.length > 0 && <button onClick={() => onApply(mismatch)} className={link}>{t("Overwrite")} {mismatch.length}</button>}
          <button onClick={() => setOpen(o => !o)} className={link}>{open ? t('Hide') : t('Show')}</button>
          <button
            onClick={onDismiss}
            aria-label={t("Dismiss")}
            title={t("Hide until these venues change")}
            className="text-amber-400 hover:text-amber-700 dark:hover:text-amber-200 text-lg leading-none px-1.5"
          >
            &times;
          </button>
        </span>
      </div>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-amber-200 dark:border-amber-800 px-4 py-2 space-y-3">
          <GapList title={t("No Dates")} gaps={missing} onOpenVenue={onOpenVenue} />
          <GapList title={t("Other Dates")} gaps={mismatch} onOpenVenue={onOpenVenue} onKeep={onKeep} />
        </div>
      )}
    </div>
  )
}

function GapList({ title, gaps, onOpenVenue, onKeep }) {
  const t = useT()
  if (!gaps.length) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80 mb-1">{title}</p>
      <ul className="space-y-1">
        {gaps.map(g => (
          <li key={g.idx} className="text-xs text-amber-900 dark:text-amber-100">
            <button onClick={() => onOpenVenue(g.idx)} className="font-medium hover:underline">{g.venue || '—'}</button>
            <span className="text-amber-700/70 dark:text-amber-300/70"> · {g.band}: </span>
            {g.have && <><span className="line-through decoration-amber-500/60">{g.have}</span> → </>}
            {g.want}
            {onKeep && (
              <button onClick={() => onKeep(g)} title={t("This venue keeps its own dates; it won’t be listed again")}
                className="ml-2 text-amber-700/80 dark:text-amber-300/80 hover:underline">{t("Keep")}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
