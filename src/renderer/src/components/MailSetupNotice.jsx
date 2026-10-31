import { hasMailAccount } from '@core/mailAccounts'

// What is still missing before the app can write an email, each with a link to
// the Settings section where it is set up. Nothing when all is in place.
// `appleScript` adds that the one-venue "Open in Mail" route works without an account.
export function mailSetupGaps(settings, templates) {
  const gaps = []
  if (!hasMailAccount(settings)) gaps.push('account')
  if (!templates?.length) gaps.push('templates')
  return gaps
}

export default function MailSetupNotice({ settings, templates, onOpenSettings, appleScript = false, className = '' }) {
  const gaps = mailSetupGaps(settings, templates)
  if (!gaps.length) return null
  const link = 'font-medium text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap'
  return (
    <div className={`rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-3 py-2 text-sm text-amber-900 dark:text-amber-100 space-y-1 ${className}`}>
      {gaps.includes('account') && (
        <p>
          No mail account set up yet — drafts and sending need one.
          {appleScript && ' (“Open in Mail” below works without one.)'}
          {onOpenSettings && <button onClick={() => onOpenSettings('mail')} className={`${link} ml-2`}>Open Mail settings</button>}
        </p>
      )}
      {gaps.includes('templates') && (
        <p>
          No email templates yet — every email starts from one.
          {onOpenSettings && <button onClick={() => onOpenSettings('templates')} className={`${link} ml-2`}>Open Mail templates</button>}
        </p>
      )}
    </div>
  )
}
