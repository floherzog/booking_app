import { accountForRow } from '@core/mailAccounts'
import { api } from '../platform'

// Bridge to the main process's IMAP scan. Only the fields the matcher needs
// cross the boundary — sending 3000 full rows through structured clone to read
// three columns would be wasteful, and the sync has no business seeing notes.
// Band, venue and account only matter in multi-band mode, where they decide
// which band's entry a message belongs to.
export async function syncFromMail(rows, settings) {
  const slim = rows.map(r => ({
    _idx: r._idx,
    _venueId: r._venueId,
    Email: r['Email'] || '',
    Band: r['Band'] || '',
    accountId: accountForRow(r, settings).id,
    'Last emailed': r['Last emailed'] || '',
    Status: r['Status'] || '',
  }))
  return api.syncMail(slim)
}

// Is any part of the mail sync actually turned on?
export function mailSyncEnabled(settings) {
  const sync = settings?.mail?.sync || {}
  return sync.lastEmailed === 'imap' || sync.replies === 'imap'
}
