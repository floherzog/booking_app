// Which band an email is about, read off its subject or its text. Used by the
// mail sync (core/mailSync.js), so a venue booked for several bands keeps each
// band's Last emailed and reply apart, and by the venue's email list, which
// shows the band instead of the subject.

// Letters and digits only, lower case: "Almost-Natural" and "almost natural"
// read the same. A misspelled name doesn't match, and then nothing is guessed.
const compact = s => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '')

// The bands `text` names, in the order given. A short name (under four
// letters) has to stand as a word of its own, or "AN" would be found in
// "Anfrage".
export function bandsNamed(text, bands = []) {
  const s = String(text || '')
  if (!s.trim()) return []
  const flat = compact(s)
  const words = ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  return bands.filter(b => {
    const key = compact(b)
    if (!key) return false
    if (key.length >= 4) return flat.includes(key)
    return words.includes(` ${String(b).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `)
  })
}

// The one band a message is about: named in the subject, else in the text.
// null when neither names exactly one.
export function bandOfMessage({ subject = '', text = '' } = {}, bands = []) {
  const inSubject = bandsNamed(subject, bands)
  if (inSubject.length === 1) return inSubject[0]
  if (inSubject.length > 1) return null
  const inText = bandsNamed(text, bands)
  return inText.length === 1 ? inText[0] : null
}

// The readable text of the start of a raw message (headers and all), good
// enough to look for a name in: quoted-printable undone, base64 parts decoded,
// HTML tags dropped. Not a MIME parser — what can't be read is skipped.
export function textOfSource(source) {
  let raw = Buffer.isBuffer(source) ? source.toString('latin1') : String(source || '')
  const out = []
  // base64 blocks: runs of lines made only of base64 characters.
  raw = raw.replace(/(?:^[A-Za-z0-9+/=]{40,}\r?\n?)+/gm, block => {
    try { out.push(Buffer.from(block.replace(/\s+/g, ''), 'base64').toString('utf8')) } catch { /* not base64 after all */ }
    return ' '
  })
  // quoted-printable: soft line breaks and =XX bytes.
  const qp = raw.replace(/=\r?\n/g, '').replace(/(?:=[0-9A-F]{2})+/g, m => {
    try { return Buffer.from(m.replace(/=/g, ''), 'hex').toString('utf8') } catch { return m }
  })
  out.unshift(qp)
  return out.join(' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}
