import { emailAddresses } from './constants.js'
import { normalizeAddress } from './mailSync.js'
import { accountForRow } from './mailAccounts.js'

// Drafts in the Drafts mailbox (src/main/ipc/mailDrafts.js) matched to the
// venues they are written to: by the To and Cc addresses against the Email
// column. A draft to nobody in the CSV belongs to no venue and is left out.
// When several rows share the address (one venue, several bands), the rows
// whose band writes from the draft's account win; failing that, all of them.

export const draftAddresses = d => [...(d.to || []), ...(d.cc || [])].map(p => normalizeAddress(p?.address)).filter(Boolean)

// → [{ draft, rows }] for every draft that belongs to a venue, newest first.
export function matchDrafts(drafts, rows, settings) {
  const byAddress = new Map()
  for (const row of rows || []) {
    for (const a of emailAddresses(row['Email'])) {
      const key = a.toLowerCase()
      if (!byAddress.has(key)) byAddress.set(key, [])
      byAddress.get(key).push(row)
    }
  }
  const out = []
  for (const draft of drafts || []) {
    const found = new Set()
    for (const a of draftAddresses(draft)) for (const r of byAddress.get(a) || []) found.add(r)
    if (!found.size) continue
    const all = [...found]
    const own = all.filter(r => accountForRow(r, settings)?.id === draft.accountId)
    out.push({ draft, rows: own.length ? own : all })
  }
  return out.sort((a, b) => (b.draft.date || '').localeCompare(a.draft.date || ''))
}

// _idx → number of drafts waiting for that row.
export function draftCounts(matched) {
  const counts = new Map()
  for (const { rows } of matched) for (const r of rows) counts.set(r._idx, (counts.get(r._idx) || 0) + 1)
  return counts
}
