import { useState } from 'react'
import { useT } from '../i18n'

// Web build: where OpenClaw's script and the Rules hold back different venues
// (lib/policySync.js). Each difference says what it means in practice and
// offers the change on this side; the script itself is only ever read.
export default function PolicyDriftNotice({ drift, rules, scriptPath, onSaveRules, onOpenLogic }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const words = list => list.map(k => `"${k}"`).join(', ')
  const apply = async next => {
    setBusy(true)
    try { await onSaveRules({ ...rules, ...next }) } finally { setBusy(false) }
  }
  const action = 'font-medium underline hover:no-underline disabled:opacity-50'
  const file = scriptPath?.split('/').pop() || ''

  return (
    <div className="space-y-1.5">
      <p className="font-medium">{t('The Rules and OpenClaw hold back different venues')}</p>
      {drift.appOnly.length > 0 && (
        <p className="text-xs">
          {t('Only here: a note with {words} holds a venue back in the app, but OpenClaw doesn’t know the word and still drafts to it.|Only here: notes with {words} hold a venue back in the app, but OpenClaw doesn’t know these words and still drafts to it.', { n: drift.appOnly.length, words: words(drift.appOnly) })}
          {' '}{t('Add it to hard_stop or wait_markers in {file}, or:|Add them to hard_stop or wait_markers in {file}, or:', { n: drift.appOnly.length, file })}
          {' '}<button type="button" disabled={busy} className={action}
            onClick={() => apply({ holdKeywords: rules.holdKeywords.filter(k => !drift.appOnly.includes(k)) })}>
            {t('Remove from the Rules')}
          </button>
        </p>
      )}
      {drift.scriptOnly.length > 0 && (
        <p className="text-xs">
          {t('Only in OpenClaw: a note with {words} holds a venue back there, but the app still lists it as due.|Only in OpenClaw: notes with {words} hold a venue back there, but the app still lists it as due.', { n: drift.scriptOnly.length, words: words(drift.scriptOnly) })}
          {' '}<button type="button" disabled={busy} className={action}
            onClick={() => apply({ holdKeywords: [...rules.holdKeywords, ...drift.scriptOnly] })}>
            {t('Add to the Rules')}
          </button>
        </p>
      )}
      {drift.days && (
        <p className="text-xs">
          {t('A hold ends after {script} days in OpenClaw, but after {app} days here.', drift.days)}
          {' '}<button type="button" disabled={busy} className={action}
            onClick={() => apply({ holdOverrideDays: drift.days.script })}>
            {t('Use {days} days here too', { days: drift.days.script })}
          </button>
        </p>
      )}
      <p className="text-xs opacity-75">
        {t('The app never changes the script. Your hold words are under')}{' '}
        <button type="button" className={action} onClick={onOpenLogic}>{t('Logic')}</button>.
      </p>
    </div>
  )
}
