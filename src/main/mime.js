import MailComposer from 'nodemailer/lib/mail-composer/index.js'

// nodemailer is used purely as a MIME writer here — no transport is ever
// created, nothing is sent. The RFC822 buffer this produces is handed to
// IMAP APPEND, which is what puts the message in the Drafts mailbox.

function addressOf({ name, address }) {
  if (!address) return undefined
  return name ? { name, address } : address
}

// data: images in `html` → cid: references plus the inline parts they need
// (the same image twice is one part). The transport's attachDataUrls does
// this, but nothing here goes through a transport.
export function inlineDataImages(html) {
  const parts = new Map() // data URL → part
  const out = String(html || '').replace(/src=(["'])data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)\1/g, (_m, q, type, b64) => {
    const key = `${type};${b64}`
    if (!parts.has(key)) parts.set(key, { cid: `image${parts.size + 1}.${Date.now().toString(36)}@booking`, contentType: type, content: Buffer.from(b64.replace(/\s+/g, ''), 'base64') })
    return `src=${q}cid:${parts.get(key).cid}${q}`
  })
  return { html: out, parts: [...parts.values()] }
}

// { from: { name, address }, to, cc, subject, html, text, inlineAssets, attachments }
//   inlineAssets: [{ path, cid }] or [{ content, contentType, cid }] → embedded and referenced as cid:<cid>
//   attachments:  [{ path, filename }] or [{ content, filename, contentType }] → ordinary attachments
//   inReplyTo / references: kept when a draft is rewritten (a reply stays one)
//   attachDataUrls: data: images in the HTML become inline parts
// → Promise<Buffer> of the complete RFC822 message.
export function buildDraftMime({ from, to, cc, subject, html, text, inlineAssets = [], attachments = [], inReplyTo, references, attachDataUrls = false }) {
  const dataImages = attachDataUrls ? inlineDataImages(html) : { html, parts: [] }
  html = dataImages.html
  const mail = {
    from: addressOf(from || {}),
    to,
    ...(cc ? { cc } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    subject: subject || '',
    html: html || '',
    // A text/plain alternative keeps the draft readable in clients that refuse
    // HTML, and stops spam filters treating it as HTML-only.
    text: text || '',
    attachments: [
      ...inlineAssets.map(a => ({
        ...(a.content ? { content: a.content, contentType: a.contentType } : { path: a.path }),
        cid: a.cid,
        // Without this the image shows up as a separate attachment instead of
        // rendering where the <img> sits.
        contentDisposition: 'inline',
      })),
      ...dataImages.parts.map(p => ({ content: p.content, contentType: p.contentType, cid: p.cid, contentDisposition: 'inline' })),
      ...attachments.map(a => (a.content ? { content: a.content, filename: a.filename, contentType: a.contentType } : { path: a.path, filename: a.filename })),
    ],
  }

  return new Promise((resolve, reject) => {
    new MailComposer(mail).compile().build((err, message) => {
      if (err) reject(err)
      else resolve(message)
    })
  })
}

// Boundaries, Date and Message-ID are regenerated on every build, so tests
// compare against a normalized form rather than the raw bytes.
export function normalizeMimeForSnapshot(buffer) {
  return buffer
    .toString('utf8')
    .replace(/\r\n/g, '\n')
    .replace(/--_NmP-[0-9a-f]+-Part_(\d+)/g, '--_BOUNDARY_-Part_$1')
    .replace(/boundary="[^"]*"/g, 'boundary="BOUNDARY"')
    .replace(/^Message-ID: <[^>]*>$/gm, 'Message-ID: <MESSAGE_ID>')
    .replace(/^Date: .*$/gm, 'Date: DATE')
    .replace(/^Content-ID: <([^>]*)>$/gm, 'Content-ID: <$1>')
}
