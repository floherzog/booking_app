import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { readSettings } from '../settingsStore.js'
import { withImapClient, resolveDraftsMailbox, accountFor, friendlyMailError, appendToSent, sentMailboxWith } from './mailImap.js'
import { smtpConfig } from './mailSmtp.js'
import { normalizeAccounts } from '../../core/mailAccounts.js'
import { htmlToText } from '../../core/htmlText.js'
import { pickPart } from './mailHistory.js'
import { buildDraftMime } from '../mime.js'

// The drafts waiting in each account's Drafts mailbox, for the Email window's
// "Current drafts" (components/DraftsPanel.jsx) and the ✓ on a venue's mail
// button. The renderer matches them to venues (core/draftMatch.js). A draft
// can be sent from here as it is, or deleted — for good, as the user chose:
// it does not go to Trash.

const LIMIT = 500
const person = p => ({ name: p?.name || '', address: p?.address || '' })

async function draftsMailbox(client, account) {
  const list = (await client.list()).map(m => ({ path: m.path, specialUse: m.specialUse }))
  const mailbox = resolveDraftsMailbox(list, account.draftsMailbox)
  return list.some(m => m.path === mailbox) ? mailbox : null
}

export async function listDraftsWith(client, account) {
  const mailbox = await draftsMailbox(client, account)
  if (!mailbox) return []
  const lock = await client.getMailboxLock(mailbox)
  try {
    let uids = await client.search({ deleted: false }, { uid: true })
    if (!uids?.length) return []
    uids = uids.slice(-LIMIT)
    const out = []
    for await (const msg of client.fetch(uids, { envelope: true, internalDate: true }, { uid: true })) {
      const env = msg.envelope || {}
      const date = env.date || msg.internalDate
      out.push({
        accountId: account.id,
        mailbox,
        uid: msg.uid,
        date: date ? new Date(date).toISOString() : '',
        to: (env.to || []).map(person),
        cc: (env.cc || []).map(person),
        subject: env.subject || '',
        messageId: env.messageId || '',
      })
    }
    return out
  } finally {
    lock.release()
  }
}

// Deleted for good: flagged \Deleted and expunged (UID EXPUNGE where the server
// has it, so nothing else flagged in the mailbox goes with it).
export async function deleteDraftWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const ok = await client.messageDelete(String(uid), { uid: true })
    if (!ok) throw new Error('That draft is no longer in the mailbox.')
    return { ok: true }
  } finally {
    lock.release()
  }
}

// A stored draft made ready to go out: the headers that only make sense in a
// draft (Mail's draft marker, autosave flags) are dropped and Date is now.
// `raw` is the message's bytes; → a Buffer, the body byte for byte as it was.
const DRAFT_ONLY = /^(x-uniform-type-identifier|x-apple-auto-saved|x-apple-mail-remote-attachments|x-apple-windows-friendly|x-apple-base-url|x-apple-mail-plain-text-draft|x-mozilla-draft-info|x-identity-key|date)\s*:/i
export function draftReadyToSend(raw, now = new Date()) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))
  const text = buf.toString('latin1')
  let end = text.indexOf('\r\n\r\n')
  let nl = '\r\n'
  if (end < 0) { end = text.indexOf('\n\n'); nl = '\n' }
  if (end < 0) return buf
  const kept = []
  let skipping = false
  for (const line of text.slice(0, end).split(nl)) {
    if (/^[ \t]/.test(line)) { if (!skipping) kept.push(line); continue } // a folded header line
    skipping = DRAFT_ONLY.test(line)
    if (!skipping) kept.push(line)
  }
  kept.push(`Date: ${now.toUTCString().replace('GMT', '+0000')}`)
  return Buffer.from(kept.join(nl) + text.slice(end), 'latin1')
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks)
}

// The draft's bytes and who it goes to (To and Cc; Bcc is not in an envelope).
export async function fetchDraftWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true })
    if (!msg) throw new Error('That draft is no longer in the mailbox.')
    const env = msg.envelope || {}
    const recipients = [...(env.to || []), ...(env.cc || []), ...(env.bcc || [])].map(p => p?.address).filter(Boolean)
    const { content } = await client.download(String(uid), undefined, { uid: true })
    return { raw: await streamToBuffer(content), recipients }
  } finally {
    lock.release()
  }
}

// Send one draft: over SMTP as it is, a copy into Sent, then out of Drafts.
// The steps after the send are best-effort — the mail has gone either way.
export async function sendDraftWith({ account, transport, fetchDraft, fileToSent, deleteDraft }) {
  const { raw, recipients } = await fetchDraft()
  if (!recipients.length) throw new Error('This draft has no recipient.')
  const mime = draftReadyToSend(raw)
  const info = await transport.sendMail({ raw: mime, envelope: { from: account.fromAddress || account.user, to: recipients } })
  let filed = true
  try { await fileToSent(mime) } catch { filed = false }
  let removed = true
  try { await deleteDraft() } catch { removed = false }
  return { accepted: info?.accepted || recipients, filed, removed }
}

// --- Editing a draft in the app ---------------------------------------------
// Mail opens a draft from a message:// link as a message to read, not to edit,
// so the Email window edits it itself: the draft is read here (its images
// turned into data: URLs the editor can show), edited, and written back as a
// new draft that replaces the old one — same sender, threading and
// attachments; the images go back in as inline parts (attachDataUrls).

const leaves = (node, out = []) => {
  if (!node) return out
  if (node.childNodes?.length) node.childNodes.forEach(n => leaves(n, out))
  else out.push(node)
  return out
}
const textAsHtml = text => String(text || '').split(/\r?\n/)
  .map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('')

// → { from, to, cc, subject, html, inReplyTo, references, attachments: [{ filename, contentType, content }] }
export async function readDraftForEditWith(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox)
  try {
    const msg = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true, headers: ['references'] }, { uid: true })
    if (!msg) throw new Error('That draft is no longer in the mailbox.')
    const env = msg.envelope || {}
    const body = pickPart(msg.bodyStructure)
    const download = async part => streamToBuffer((await client.download(String(uid), part, { uid: true })).content)
    let html = ''
    if (body) {
      const content = (await download(body.part)).toString('utf8')
      html = body.type === 'html' ? content : textAsHtml(content)
    }
    // Everything that isn't the text itself: images shown in it, attachments.
    const attachments = []
    for (const node of leaves(msg.bodyStructure)) {
      if (!node.part || (body && node.part === body.part)) continue
      if (!node.disposition && /^text\/(plain|html)$/.test(node.type)) continue // the other alternative
      const content = await download(node.part)
      const cid = String(node.id || '').replace(/^<|>$/g, '')
      if (cid && html.includes(`cid:${cid}`)) {
        html = html.split(`cid:${cid}`).join(`data:${node.type};base64,${content.toString('base64')}`)
        continue
      }
      const filename = node.dispositionParameters?.filename || node.parameters?.name || 'attachment'
      attachments.push({ filename, contentType: node.type, content })
    }
    // Only what's inside <body>: the editor wants the content.
    const inner = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)
    const references = (msg.headers ? msg.headers.toString() : '').replace(/^references:\s*/i, '').replace(/\s+/g, ' ').trim()
    return {
      from: person((env.from || [])[0]),
      to: (env.to || []).map(person),
      cc: (env.cc || []).map(person),
      subject: env.subject || '',
      html: inner ? inner[1] : html,
      inReplyTo: env.inReplyTo || '',
      references,
      attachments,
    }
  } finally {
    lock.release()
  }
}

// The edited draft in, the old one out. `edit`: { to, cc, subject, html }
// (addresses as text). → { mailbox, uid } of the new draft.
export async function replaceDraftWith(client, account, { mailbox, uid }, edit) {
  const old = await readDraftForEditWith(client, mailbox, uid)
  const mime = await buildDraftMime({
    from: old.from?.address ? old.from : { name: account.fromName, address: account.fromAddress || account.user },
    to: edit.to,
    cc: edit.cc || undefined,
    subject: edit.subject,
    html: edit.html,
    text: htmlToText(edit.html),
    attachments: old.attachments,
    inReplyTo: old.inReplyTo || undefined,
    references: old.references || undefined,
    attachDataUrls: true,
  })
  const res = await client.append(mailbox, mime, ['\\Draft', '\\Seen'])
  // Only once the new one is safely in: the old one goes.
  await deleteDraftWith(client, mailbox, uid)
  return { mailbox, uid: res?.uid ?? null }
}

// refs → Map(accountId → refs), at most 200 in all.
function byAccount(refs) {
  const out = new Map()
  for (const ref of (Array.isArray(refs) ? refs : []).slice(0, 200)) {
    const list = out.get(ref.accountId) || []
    list.push(ref)
    out.set(ref.accountId, list)
  }
  return out
}

// Several drafts of one account sent together: one login reads them all, the
// SMTP connections send them side by side, and one more login files the copies
// in Sent and takes them out of Drafts. (One at a time, every draft cost three
// logins and a connection of its own.) `deps` is injectable for the tests.
// → [{ ...ref, accepted, filed, removed } | { ...ref, error }], in ref order.
export async function sendDraftsFor(account, refs, {
  withClient = fn => withImapClient(account, fn),
  transport,
} = {}) {
  const results = new Map()
  const fail = (ref, e) => results.set(ref, { ...ref, error: friendlyMailError(e, account) })
  const ready = []
  try {
    await withClient(async client => {
      for (const ref of refs) {
        try {
          const { raw, recipients } = await fetchDraftWith(client, ref.mailbox, ref.uid)
          if (!recipients.length) throw new Error('This draft has no recipient.')
          ready.push({ ref, mime: draftReadyToSend(raw), recipients })
        } catch (e) { fail(ref, e) }
      }
    })
  } catch (e) {
    refs.filter(r => !results.has(r) && !ready.some(x => x.ref === r)).forEach(r => fail(r, e))
  }
  const sent = []
  await Promise.all(ready.map(async item => {
    try {
      const info = await transport.sendMail({ raw: item.mime, envelope: { from: account.fromAddress || account.user, to: item.recipients } })
      sent.push(item)
      results.set(item.ref, { ...item.ref, accepted: info?.accepted || item.recipients, filed: false, removed: false })
    } catch (e) { fail(item.ref, e) }
  }))
  // Gone out either way from here on: filing and removing are best-effort,
  // and a failure only shows as "still in Drafts".
  if (sent.length) {
    try {
      await withClient(async client => {
        let sentBox = null
        try { sentBox = await sentMailboxWith(client, account) } catch { /* not filed */ }
        for (const item of sent) {
          const r = results.get(item.ref)
          if (sentBox) {
            try { await client.append(sentBox, item.mime, ['\\Seen']); r.filed = true } catch { /* not filed */ }
          }
          try { await deleteDraftWith(client, item.ref.mailbox, item.ref.uid); r.removed = true } catch { /* still in Drafts */ }
        }
      })
    } catch { /* the login failed: sent, but not filed or removed */ }
  }
  return refs.map(r => results.get(r))
}

export function registerMailDraftsIpc() {
  ipcMain.handle('mailDrafts:list', async () => {
    const accounts = normalizeAccounts(readSettings().mail).filter(a => a.host && a.user)
    // Each account is its own server login, so they are asked side by side.
    const results = await Promise.allSettled(accounts.map(account => withImapClient(account, listDraftsWith)))
    const drafts = []
    const failures = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') drafts.push(...r.value)
      else failures.push(friendlyMailError(r.reason, accounts[i]))
    })
    return { drafts, failures }
  })

  ipcMain.handle('mailDrafts:delete', async (_e, { accountId, mailbox, uid } = {}) => {
    try {
      return await withImapClient(accountFor(accountId), client => deleteDraftWith(client, mailbox, uid))
    } catch (e) {
      return { error: friendlyMailError(e) }
    }
  })

  // Several at once: accounts side by side, one login per account.
  ipcMain.handle('mailDrafts:deleteMany', async (_e, refs = []) => {
    const results = await Promise.all([...byAccount(refs)].map(async ([accountId, list]) => {
      const out = []
      try {
        await withImapClient(accountFor(accountId), async client => {
          for (const ref of list) {
            try { out.push({ ...ref, ...(await deleteDraftWith(client, ref.mailbox, ref.uid)) }) } catch (e) { out.push({ ...ref, error: e.message }) }
          }
        })
      } catch (e) {
        const done = new Set(out.map(r => r.uid))
        list.filter(ref => !done.has(ref.uid)).forEach(ref => out.push({ ...ref, error: friendlyMailError(e) }))
      }
      return out
    }))
    return results.flat()
  })

  ipcMain.handle('mailDrafts:sendMany', async (_e, refs = []) => {
    const results = await Promise.all([...byAccount(refs)].map(async ([accountId, list]) => {
      let transport
      let account
      try {
        account = accountFor(accountId)
        // A few SMTP connections, so the drafts go out side by side.
        transport = nodemailer.createTransport({ ...smtpConfig(account), pool: true, maxConnections: 3 })
        return await sendDraftsFor(account, list, { transport })
      } catch (e) {
        return list.map(ref => ({ ...ref, error: friendlyMailError(e, account) }))
      } finally {
        transport?.close()
      }
    }))
    return results.flat()
  })

  ipcMain.handle('mailDrafts:read', async (_e, { accountId, mailbox, uid } = {}) => {
    try {
      const d = await withImapClient(accountFor(accountId), client => readDraftForEditWith(client, mailbox, uid))
      // The renderer only needs to know the attachments are there.
      return { ...d, attachments: d.attachments.map(a => ({ filename: a.filename, size: a.content.length })) }
    } catch (e) {
      return { error: friendlyMailError(e) }
    }
  })

  ipcMain.handle('mailDrafts:replace', async (_e, { ref = {}, edit = {} } = {}) => {
    try {
      return await withImapClient(accountFor(ref.accountId), (client, account) => replaceDraftWith(client, account, ref, edit))
    } catch (e) {
      return { error: friendlyMailError(e) }
    }
  })

  ipcMain.handle('mailDrafts:send', async (_e, { accountId, mailbox, uid } = {}) => {
    const account = accountFor(accountId)
    let transport
    try {
      transport = nodemailer.createTransport(smtpConfig(account))
      return await sendDraftWith({
        account,
        transport,
        fetchDraft: () => withImapClient(account, client => fetchDraftWith(client, mailbox, uid)),
        fileToSent: mime => appendToSent(mime, account.id),
        deleteDraft: () => withImapClient(account, client => deleteDraftWith(client, mailbox, uid)),
      })
    } catch (e) {
      return { error: friendlyMailError(e, account) }
    } finally {
      transport?.close()
    }
  })
}
