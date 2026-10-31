import { useState, useMemo } from 'react'
import RelDate from './RelDate'
import MailSetupNotice, { mailSetupGaps } from './MailSetupNotice'
import { prepareDraft, createDraft, createDraftViaAppleScript, sendEmail } from '../lib/drafts'
import { useGenders, useContactGenders } from '../lib/genders'
import { languageForRow } from '@core/templates'
import { t, useT } from '../i18n'

// The per-venue draft action. The IMAP path is primary; the AppleScript one sits
// in the overflow because it drives Mail's window by keystroke and needs macOS
// permissions, so it is only ever sensible for a single draft.
// `showSend` promotes sending from the overflow to a button of its own. The venue
// detail view sets it — there is room there, and sending one venue you are already
// looking at is a normal thing to want. In the table row it stays in the overflow.
export default function DraftVenueButton({ row, templates, languages, settings, draftedAtIso, onDraftCreated, onSent, onOpenSettings, showSend = false }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { ok, message }
  const [overflow, setOverflow] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  // A German venue needs its grammatical gender before {{article}} can resolve.
  // Fetching it re-renders, and the memo below has to notice that.
  const needsGender = languageForRow(row, languages) === 'de'
    && (settings?.templates?.germanArticles ?? 'ondevice') !== 'off'
  const genderVersion = useGenders([row['Venue']], needsGender)
  // The contact's first name, for {{greeting}} (Liebe / Lieber, Ms / Mr).
  const onDevice = (settings?.templates?.germanArticles ?? 'ondevice') !== 'off'
  const nameVersion = useContactGenders([row['Contact']], onDevice)

  const prepared = useMemo(
    () => prepareDraft(row, templates, languages, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row, templates, languages, settings, genderVersion, nameVersion],
  )

  // No account: drafting over IMAP and sending can't work, Open in Mail.app can.
  // No templates at all: nothing can be written. Both say where to fix it.
  const setupGaps = mailSetupGaps(settings, templates)
  const noAccount = setupGaps.includes('account')

  async function run(fn, successMessage, { sent = false } = {}) {
    setBusy(true)
    setStatus(null)
    setOverflow(false)
    setConfirmSend(false)
    try {
      await fn(row, templates, languages, settings)
      setStatus({ ok: true, message: successMessage })
      if (sent) onSent?.(row)
      else onDraftCreated?.(row)
    } catch (e) {
      setStatus({ ok: false, message: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        {prepared.ok && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            <span className="font-mono">{prepared.language}</span>
            {prepared.fallbackUsed && <span className="text-amber-600 dark:text-amber-400"> {t("(fallback)")}</span>}
            {prepared.empties.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400" title={t('Empty: {fields}', { fields: prepared.empties.join(', ') })}>
                {' '}· {prepared.empties.length} {t("empty")}
              </span>
            )}
          </span>
        )}

        <button
          onClick={() => run(createDraft, t('Draft created in Mail'))}
          disabled={!prepared.ok || busy || noAccount}
          title={noAccount ? t('Set up a mail account first (Settings ▸ Mail settings)') : prepared.ok ? t('Create a draft in your Drafts mailbox over IMAP') : prepared.reason}
          className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-700 dark:hover:bg-white transition-colors disabled:opacity-40"
        >
          {busy ? t('Drafting…') : t('Draft in Mail')}
        </button>

        {showSend && (
          <button
            onClick={() => {
              // Two clicks rather than a system confirm(): Electron's renderer
              // modals are worth avoiding, and this one actually sends mail.
              if (!confirmSend) { setConfirmSend(true); return }
              run(sendEmail, t('Email sent'), { sent: true })
            }}
            onBlur={() => setTimeout(() => setConfirmSend(false), 150)}
            disabled={!prepared.ok || busy || noAccount}
            title={noAccount ? t('Set up a mail account first (Settings ▸ Mail settings)') : prepared.ok ? t('Send over SMTP to {email} right now', { email: row['Email'] }) : prepared.reason}
            className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 ${confirmSend
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500'}`}
          >
            {busy ? t('Sending…') : confirmSend ? t('Really send?') : t('Send now')}
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => { setOverflow(v => !v); setConfirmSend(false) }}
            onBlur={() => setTimeout(() => setOverflow(false), 150)}
            disabled={!prepared.ok || busy}
            title={t("Other ways to create this draft")}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-1.5 rounded transition-colors disabled:opacity-40"
          >
            ⋯
          </button>
          {overflow && (
            <div className="absolute right-0 bottom-full mb-1 z-10 w-64 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
              {!showSend && !noAccount && (
                <button
                  onMouseDown={e => {
                    e.preventDefault()
                    // Two clicks rather than a system confirm(): this sits one item
                    // away from the ordinary draft button, and Electron's modal
                    // dialogs are worth avoiding in the renderer.
                    if (!confirmSend) { setConfirmSend(true); return }
                    run(sendEmail, t('Email sent'), { sent: true })
                  }}
                  className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
                >
                  <span className={`block text-xs ${confirmSend ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-gray-700 dark:text-gray-200'}`}>
                    {confirmSend ? t('Really send to {email}?', { email: row['Email'] }) : t('Send now instead')}
                  </span>
                  <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                    {t("Goes out over SMTP immediately and stages a “Last emailed” edit.")}
                  </span>
                </button>
              )}
              <button
                onMouseDown={e => { e.preventDefault(); run(createDraftViaAppleScript, t('Compose window opened in Mail')) }}
                className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="block text-xs text-gray-700 dark:text-gray-200">{t("Open in Mail.app instead")}</span>
                <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                  {t("No server setup, but macOS will ask for Automation and Accessibility permission.")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {setupGaps.length > 0 && (
        <MailSetupNotice settings={settings} templates={templates} onOpenSettings={onOpenSettings} appleScript={noAccount && prepared.ok} className="max-w-sm text-xs" />
      )}
      {!prepared.ok && !setupGaps.includes('templates') && (
        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs text-right">{prepared.reason}</p>
      )}
      {status && (
        <p className={`text-xs max-w-xs text-right ${status.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {status.message}
        </p>
      )}
      {draftedAtIso && !status && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {t("Drafted")} <RelDate raw={draftedAtIso} colorFn={() => 'text-gray-400'} />
        </p>
      )}
    </div>
  )
}
