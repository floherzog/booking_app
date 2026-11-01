import { createContext } from 'react'
import { api } from '../platform'
import { parseDate } from '@core/parseDate'

// A venue's emails (src/main/ipc/mailHistory.js), fetched once per address per
// session — opening the same venue again, or its reply date, costs nothing.
// MailContext carries whether there is a mailbox to ask (mailReady) and how to
// open a message in the reader; App provides it.
export const MailContext = createContext({ ready: false, openMessage: () => {}, openReply: async () => false })

const cache = new Map()

export function getHistory(email) {
  const key = String(email || '').trim().toLowerCase()
  if (!key) return Promise.resolve([])
  if (!cache.has(key)) {
    cache.set(key, api.listMailHistory(email)
      .then(r => r?.messages || [])
      .catch(() => { cache.delete(key); return [] }))
  }
  return cache.get(key)
}

// After a mail sync or a reload, new messages may be there.
export function forgetHistory() {
  cache.clear()
}

// The incoming message a Last reply date stands for: the newest one from that
// day, or null (a date typed by hand, or a message since deleted).
export function findReply(messages, dateStr) {
  const day = parseDate(dateStr)
  if (!day) return null
  const same = d => d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  return messages.find(m => m.direction === 'in' && m.date && same(new Date(m.date))) || null
}
