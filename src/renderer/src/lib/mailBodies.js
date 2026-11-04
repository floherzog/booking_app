import { api } from '../platform'

// Message bodies read ahead, so opening a draft in the Email window shows it at
// once instead of waiting on the server. Keyed by account, mailbox and UID: a
// draft changed in Mail is saved as a new message with a new UID, so a cached
// body never goes stale. Failures are not kept — the next open asks again.

const cache = new Map() // key → mail
const pending = new Set()
const key = r => `${r.accountId}|${r.mailbox}|${r.uid}`
const MAX = 300

function remember(ref, mail) {
  cache.set(key(ref), mail)
  if (cache.size > MAX) cache.delete(cache.keys().next().value)
}

export function cachedMail(ref) {
  return cache.get(key(ref)) || null
}

export async function readMail(ref) {
  const hit = cachedMail(ref)
  if (hit) return hit
  const r = await api.readMail({ accountId: ref.accountId, mailbox: ref.mailbox, uid: ref.uid })
  if (r && !r.error) remember(ref, r)
  return r
}

// Fetch the bodies not cached yet, in the background. Quietly does nothing
// where there is no mail (the web build) or nothing to fetch.
export async function preloadMail(refs = []) {
  if (!api.readMails) return
  const todo = refs.filter(r => r && !cache.has(key(r)) && !pending.has(key(r))).slice(0, 100)
  if (!todo.length) return
  todo.forEach(r => pending.add(key(r)))
  try {
    const results = await api.readMails(todo.map(r => ({ accountId: r.accountId, mailbox: r.mailbox, uid: r.uid })))
    for (const r of results || []) if (r?.mail && !r.error) remember(r, r.mail)
  } catch {
    // reading ahead is a nicety: opening the message still fetches it
  } finally {
    todo.forEach(r => pending.delete(key(r)))
  }
}
