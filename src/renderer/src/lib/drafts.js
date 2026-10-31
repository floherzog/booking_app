import { resolveTemplate, substituteTemplate, contactOptionsFor } from '@core/templates'
import { emailAddresses, isOnlineForm } from '@core/constants'
import { renderEmailHtml } from '@core/emailHtml'
import { genderOf, contactGenderOf, ensureGenders, ensureContactGenders } from './genders'
import { accountForRow } from '@core/mailAccounts'
import { api } from '../platform'

// The key a created draft is logged under. Venue+City+Band identifies a venue
// row independently of its position in the CSV, so the log survives re-sorting
// and re-importing.
export function draftKey(row) {
  return `${row['Venue'] || ''}||${row['City'] || ''}||${row['Band'] || ''}`
}

export function draftedAt(settings, row) {
  return settings?.draftLog?.[draftKey(row)] || null
}

// Everything that decides whether a draft can be created, without creating one.
// Drives the preflight list and the disabled-with-a-reason buttons.
// `settings` is optional and only supplies the {{contact}} / {{greeting}}
// options (name style and the per-language fallback greeting); without it the
// raw Contact value is used, which is what the core defaults to.
export function prepareDraft(row, templates, languages, settings) {
  // Only real addresses: an Email cell may hold several, or a note around one.
  const email = emailAddresses(row['Email']).join(', ')
  const resolved = resolveTemplate(templates, row, languages)

  // `resolved` carries its own `reason`, so it is spread first — otherwise it
  // would overwrite the more specific message below.
  if (!email) {
    const reason = isOnlineForm(row)
      ? 'This venue only takes an online form.'
      : 'No email address for this venue.'
    return { ...resolved, ok: false, reason, empties: [] }
  }
  if (!resolved.template) {
    return { ...resolved, ok: false, empties: [] }
  }

  const opts = settings ? contactOptionsFor(row, settings) : {}
  // The greeting follows the template actually used — an English fallback
  // template for a German venue says "Dear", not "Liebe".
  opts.language = resolved.language
  // Only German templates have articles to decline, and only when the feature is
  // on — everywhere else {{article}} stays unresolved and is reported as empty.
  if (resolved.language === 'de' && (settings?.templates?.germanArticles ?? 'ondevice') !== 'off') {
    opts.gender = genderOf(row['Venue'])
  }
  // "Liebe" or "Lieber" for {{greeting}}; unknown leaves the neutral form.
  opts.contactGender = contactGenderOf(row['Contact'])
  const substituted = substituteTemplate(resolved.template, row, opts)
  const { html, cids } = renderEmailHtml(substituted.bodyJSON)

  return {
    ...resolved,
    ok: true,
    empties: substituted.empties,
    // The band decides which mailbox this goes out from; main resolves the id
    // back to a full account (host, credentials, Drafts/Sent folders).
    draft: { to: email, subject: substituted.subject, html, cids, accountId: accountForRow(row, settings).id },
  }
}

// What a one-off draft needs from the on-device model before prepareDraft can
// run: the venue's article and the contact's first name. Bulk runs and the
// venue panel fetch these as they render (useGenders); a draft started from
// the table has no such moment, so it waits for them here. Both are cached,
// so this costs nothing the second time.
export async function resolveForDraft(rows, settings) {
  if ((settings?.templates?.germanArticles ?? 'ondevice') === 'off') return
  await Promise.all([
    ensureGenders(rows.map(r => r['Venue'])),
    ensureContactGenders(rows.map(r => r['Contact'])),
  ])
}

// Create the draft over IMAP. Deliberately does NOT touch 'Last emailed': a
// draft sitting in Mail is not a sent email, and treating it as one would push
// the venue out of the send list without anything having gone out.
export async function createDraft(row, templates, languages, settings) {
  const prepared = prepareDraft(row, templates, languages, settings)
  if (!prepared.ok) throw new Error(prepared.reason)
  const result = await api.appendDraft(prepared.draft)
  return { ...result, prepared }
}

// Send a prepared message over SMTP. Unlike a draft this is irreversible, and
// the caller is expected to record it on the row ('Last emailed').
export async function sendEmail(row, templates, languages, settings) {
  const prepared = prepareDraft(row, templates, languages, settings)
  if (!prepared.ok) throw new Error(prepared.reason)
  const result = await api.sendMail(prepared.draft)
  return { ...result, prepared }
}

// One prepared message, delivered the way the run's mode asked for.
export function deliverPrepared(prepared, delivery) {
  return delivery === 'send'
    ? api.sendMail(prepared.draft)
    : api.appendDraft(prepared.draft)
}

// The AppleScript fallback: no server configuration, but it drives Mail's UI, so
// it is offered for one venue at a time only.
export async function createDraftViaAppleScript(row, templates, languages, settings) {
  const prepared = prepareDraft(row, templates, languages, settings)
  if (!prepared.ok) throw new Error(prepared.reason)
  await api.appleScriptDraft(prepared.draft)
  return { prepared }
}
