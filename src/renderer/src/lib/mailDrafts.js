import { useSyncExternalStore } from 'react'
import { api } from '../platform'

// The drafts waiting in the Drafts mailboxes (src/main/ipc/mailDrafts.js), for
// the Email window's "Current drafts" and the ✓ on a venue's mail button.
// Asked for again whenever something may have changed them: a draft made or
// sent here, ↻, opening the Email window, and coming back to the app (a draft
// deleted in Mail meanwhile).
// state: { drafts: [...] | null (not asked yet), loading, error }

let state = { drafts: null, loading: false, error: '' }
const listeners = new Set()
const set = patch => { state = { ...state, ...patch }; listeners.forEach(l => l()) }
let inFlight = null
let lastAsked = 0

export function refreshDrafts() {
  if (inFlight) return inFlight
  set({ loading: true })
  lastAsked = Date.now()
  inFlight = api.listDrafts()
    .then(r => set({ drafts: r?.drafts || [], error: r?.failures?.[0] || '', loading: false }))
    .catch(e => set({ error: e.message, loading: false }))
    .finally(() => { inFlight = null })
  return inFlight
}

// After a draft is made: once, shortly after the last of a run.
let laterTimer = null
export function refreshDraftsLater(ms = 1500) {
  clearTimeout(laterTimer)
  laterTimer = setTimeout(refreshDrafts, ms)
}

// Not more than once a minute: for coming back to the window.
export function refreshDraftsSoon() {
  if (Date.now() - lastAsked > 60_000) refreshDrafts()
}

// What changed here is taken off at once rather than waiting for the server.
export function dropDraft(ref) {
  if (!state.drafts) return
  set({ drafts: state.drafts.filter(d => !(d.accountId === ref.accountId && d.mailbox === ref.mailbox && d.uid === ref.uid)) })
}

export function forgetDrafts() {
  set({ drafts: null, error: '' })
}

const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }
export function useDrafts() {
  return useSyncExternalStore(subscribe, () => state)
}

export const draftRefKey = d => `${d.accountId}|${d.mailbox}|${d.uid}`
