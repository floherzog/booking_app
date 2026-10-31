
import { t, useT } from '../i18n'// The confirmation for the multi-band file actions — opening an existing set of
// band files, starting a new set, importing several band files. It always says
// that this is multi-band mode, whether the mode gets switched on, and what
// happens to which files, before anything is touched.
// `plan` comes from lib/multiBandSwitch (planOpenBandFiles / planNewBandSet /
// planImportBandFiles).
// `fresh`: shown on the first-run screen, where there is no current CSV to mention.
export default function BandFilesPlan({ plan, multiBandOn, fresh = false, busy, done, error, onConfirm, onCancel }) {
  const t = useT()
  if (!plan) return null
  const mono = 'font-mono'
  const blocked = plan.kind === 'newset' && plan.clashes.length > 0

  const title = {
    open: t('Use these band files?'),
    newset: t('Start a new set of band files?'),
    import: t('Import {venues} from {files}?', {
      venues: t('{n} venue|{n} venues', { n: plan.venues }),
      files: t('{n} band file|{n} band files', { n: plan.files.length }),
    }),
  }[plan.kind]

  const confirm = {
    open: multiBandOn ? t('Use these band files') : t('Switch on and use these files'),
    newset: multiBandOn ? t('Create band files') : t('Switch on and create band files'),
    import: multiBandOn ? t('Import') : t('Switch on and import'),
  }[plan.kind]

  return (
    <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-2 text-xs text-amber-800 dark:text-amber-300">
      <p>
        <span className="font-semibold">{title}</span>
        <span className="ml-1.5 inline-block rounded bg-amber-200/70 dark:bg-amber-800/60 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">{t("Multi-band mode")}</span>
      </p>
      {plan.dir && <p className={`${mono} break-all text-amber-700 dark:text-amber-400`}>{plan.dir}</p>}

      <ul className="space-y-0.5">
        {plan.files.map(f => (
          <li key={f.name} className="flex justify-between gap-3">
            <span className={`${mono} truncate`}>{f.name}</span>
            <span className="shrink-0">
              {plan.kind === 'newset'
                ? (f.band ? f.band : t('venues without a band'))
                : <>{t('{n} venue|{n} venues', { n: f.count })}{f.band ? ` · ${f.band}` : ` ${t('without a band')}`}</>}
            </span>
          </li>
        ))}
      </ul>

      {plan.kind === 'open' && plan.skipped?.length > 0 && (
        <p>{t("Left out:")} {plan.skipped.map(s => `${s.name} (${s.reason})`).join('; ')}.</p>
      )}
      {plan.kind === 'open' && plan.missingUnassigned && (
        <p>{t("There is no file for venues without a band yet — an empty one is added.")}</p>
      )}
      {plan.kind === 'newset' && blocked && (
        <p className="text-red-700 dark:text-red-400 font-medium">{t("Already in that folder:")} {plan.clashes.join(', ')}{t(". Pick another name or folder.")}</p>
      )}

      <p>
        {plan.kind === 'import'
          ? (multiBandOn
            ? t('The venues are added to your list, each to its own band. Nothing is written until you press Save.')
            : <><span className="font-semibold">{t("Multi-band mode is off, so it is switched on first:")}</span> {t("your current CSV is split into one file per band (the original is kept as a backup), then these venues are added. They reach the band files when you press Save.")}</>)
          : multiBandOn
            ? t('The app switches to these files. The band files it uses now stay on disk, untouched.')
            : fresh
              ? <><span className="font-semibold">{t("This switches multi-band mode on.")}</span> {t("Switching it off later merges the band files back into one CSV.")}</>
              : <><span className="font-semibold">{t("This switches multi-band mode on.")}</span> {t("Your current CSV is left as it is and no longer used — switching the mode off later merges the band files back into one CSV.")}</>}
        {' '}{t("The booking scripts and the web app only know a single CSV.")}
      </p>

      {error && <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>}
      {done ? (
        <p className="font-semibold text-green-700 dark:text-green-400">{done}</p>
      ) : (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || blocked}
            className="bg-amber-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {busy ? t('Working…') : confirm}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="py-1.5 px-3 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-40 transition-colors"
          >
            {t("Cancel")}
          </button>
        </div>
      )}
    </div>
  )
}
