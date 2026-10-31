import { applyGermanArticles, hasArticlePlaceholder } from './germanArticles.js'

// Email templates are keyed by band × language. The venue's Country decides the
// language through the configurable country→language map; everything else falls
// back to the default language.

// The fields a template may interpolate, written as {{name}} in the subject and
// in the body's text. Lowercase on purpose — they read as prose, not columns.
export const PLACEHOLDERS = ['greeting', 'venue', 'contact', 'city', 'country', 'dates', 'text', 'band', 'article']

const PLACEHOLDER_FIELDS = {
  venue: 'Venue',
  contact: 'Contact',
  city: 'City',
  country: 'Country',
  dates: 'Dates',
  text: 'Text',
  band: 'Band',
}

const PLACEHOLDER_RE = /\{\{\s*([a-z]+)\s*\}\}/gi

// How {{contact}} and {{greeting}} are rendered. `contactStyle` picks how a
// known contact is addressed — first name, full name, or formally ("Sehr
// geehrte Frau Müller"); `contactFallbacks` supplies a per-language stand-in
// when the venue has no contact at all, so a greeting never comes out as
// "Hallo ,".
export const CONTACT_STYLES = ['first', 'full', 'formal']
export const DEFAULT_TEMPLATE_OPTIONS = {
  contactStyle: 'full',            // 'first' | 'full' | 'formal'
  contactFallbacks: {
    en: '{{venue}} team',
    de: '{{venue}} Team',
  },
  // How a video is inserted. Both are applied at insert time — the badge is
  // drawn into the saved image, and the label choice is stored on the node — so
  // changing either never rewrites videos that are already in a template.
  video: {
    showLabel: true,               // the "▶ Title" text link under the thumbnail
    playOverlay: true,             // a play button drawn onto the thumbnail
  },
  // {{article}} in a German template needs the venue's grammatical gender, which
  // Apple's on-device model supplies. 'off' leaves the placeholder unresolved and
  // flagged; nothing here ever reaches the network.
  germanArticles: 'ondevice',      // 'ondevice' | 'off'
}

function norm(s) {
  return String(s || '').trim().toLowerCase()
}

// Resolve the substitution options for one venue: the name style, plus the
// fallback greeting for the language that venue's country maps to.
export function contactOptionsFor(row, settings) {
  const opts = { ...DEFAULT_TEMPLATE_OPTIONS, ...(settings?.templates || {}) }
  const fallbacks = { ...DEFAULT_TEMPLATE_OPTIONS.contactFallbacks, ...(opts.contactFallbacks || {}) }
  const language = languageForRow(row, settings?.languages)
  return {
    contactStyle: CONTACT_STYLES.includes(opts.contactStyle) ? opts.contactStyle : 'full',
    language,
    contactFallback: fallbacks[language] ?? fallbacks[norm(settings?.languages?.default) || 'en'] ?? '',
  }
}

// "Anna Müller" → "Anna". Names with a comma ("Müller, Anna") are read as
// surname-first, which is how the CSV occasionally records them.
export function firstNameOf(full) {
  const value = String(full || '').trim()
  if (!value) return ''
  if (value.includes(',')) {
    const after = value.split(',')[1]?.trim()
    if (after) return after.split(/\s+/)[0]
  }
  return value.split(/\s+/)[0]
}

// "Anna Müller" → "Müller", "Müller, Anna" → "Müller", "Jan van der Berg" →
// "van der Berg". A single name is returned as it is.
const SURNAME_PARTICLES = new Set(['von', 'van', 'de', 'der', 'den', 'zu', 'zum', 'di', 'da', 'del', 'du', 'le', 'la', 'ten', 'ter'])
export function lastNameOf(full) {
  const value = String(full || '').trim()
  if (!value) return ''
  if (value.includes(',')) return value.split(',')[0].trim()
  const words = value.split(/\s+/)
  if (words.length === 1) return value
  let i = words.length - 1
  while (i > 1 && SURNAME_PARTICLES.has(words[i - 1].toLowerCase())) i -= 1
  return words.slice(i).join(' ')
}

// The whole salutation for {{greeting}}, name included. `gender` is the
// contact's first name read by the on-device model: 'f' | 'm', anything else
// (unknown, or the web build) gets the neutral form. `fallback` is the already
// resolved stand-in for a venue without a contact ("Club X Team").
const GREETINGS = {
  de: {
    informal: { f: n => `Liebe ${n}`, m: n => `Lieber ${n}`, x: n => `Hallo ${n}`, team: t => `Liebes ${t}`, none: () => 'Hallo zusammen' },
    formal: { f: n => `Sehr geehrte Frau ${n}`, m: n => `Sehr geehrter Herr ${n}`, x: n => `Guten Tag ${n}`, team: () => 'Sehr geehrte Damen und Herren', none: () => 'Sehr geehrte Damen und Herren' },
  },
  en: {
    informal: { f: n => `Dear ${n}`, m: n => `Dear ${n}`, x: n => `Dear ${n}`, team: t => `Dear ${t}`, none: () => 'Hello' },
    formal: { f: n => `Dear Ms ${n}`, m: n => `Dear Mr ${n}`, x: n => `Dear ${n}`, team: t => `Dear ${t}`, none: () => 'Dear Sir or Madam' },
  },
}
export function greetingFor({ contact, style = 'full', language = 'en', gender, fallback = '' }) {
  const g = GREETINGS[language] || GREETINGS.en
  const name = String(contact || '').trim()
  const forms = g[style === 'formal' ? 'formal' : 'informal']
  if (!name) return fallback ? forms.team(fallback) : forms.none()
  const sex = gender === 'f' || gender === 'm' ? gender : 'x'
  if (style === 'formal') return forms[sex](sex === 'x' ? name : lastNameOf(name))
  return forms[sex](style === 'first' ? firstNameOf(name) : name)
}

// The venue's template language: a case-insensitive match of its Country against
// the configured map, otherwise the default. Countries are matched on both sides
// normalized, so "germany", "Germany" and " Deutschland " all land correctly.
export function languageForRow(row, languages) {
  const fallback = norm(languages?.default) || 'en'
  const country = norm(row?.['Country'])
  if (!country) return fallback
  const map = languages?.map || {}
  for (const [name, lang] of Object.entries(map)) {
    if (norm(name) === country) return norm(lang) || fallback
  }
  return fallback
}

// Pick the template for a venue:
//   band + its country's language  →  band + the default language  →  none.
// Always reports which language was used and whether that was a fallback, so the
// UI can warn before a draft goes out in the wrong language.
export function resolveTemplate(templates, row, languages) {
  const band = row?.['Band'] || ''
  const language = languageForRow(row, languages)
  const defaultLanguage = norm(languages?.default) || 'en'
  const list = templates || []

  if (!band) {
    return { template: null, language, fallbackUsed: false, reason: 'This venue has no band set.' }
  }

  const forBand = list.filter(t => t.band === band)
  if (forBand.length === 0) {
    return { template: null, language, fallbackUsed: false, reason: `No templates for "${band}" yet.` }
  }

  const exact = forBand.find(t => norm(t.language) === language)
  if (exact) return { template: exact, language, fallbackUsed: false, reason: '' }

  const fallback = forBand.find(t => norm(t.language) === defaultLanguage)
  if (fallback) {
    return {
      template: fallback,
      language: defaultLanguage,
      fallbackUsed: true,
      reason: `No "${language}" template for ${band} — using "${defaultLanguage}".`,
    }
  }

  return {
    template: null,
    language,
    fallbackUsed: false,
    reason: `No "${language}" or "${defaultLanguage}" template for ${band}.`,
  }
}

// Replace {{placeholders}} with the venue's values. A missing or blank field
// becomes '' rather than leaving the raw token in the email, and is reported so
// the UI can flag it before a draft is created.
//
// `opts` ({ contactStyle, contactFallback, language, contactGender }) only
// affects {{contact}} and {{greeting}}. Omitting it keeps the plain behaviour:
// whatever is in the Contact column, or ''.
export function substitutePlaceholders(str, row, opts = {}) {
  const empties = new Set()

  // {{article}} resolves first and separately: it is the only placeholder whose
  // value depends on the words around it rather than on a column. With no gender
  // for the venue — an English template, or the on-device model unavailable — the
  // token is dropped rather than mailed out raw, and reported like an empty field
  // so the UI can warn before anything is sent.
  let source = String(str ?? '')
  if (hasArticlePlaceholder(source)) {
    if (opts.gender) {
      source = applyGermanArticles(source, opts.gender)
    } else {
      source = source.replace(/\{\{\s*article\s*\}\}\s*/gi, '')
      empties.add('article')
    }
  }

  const text = source.replace(PLACEHOLDER_RE, (match, rawName) => {
    const name = rawName.toLowerCase()
    if (name === 'greeting') {
      const fallback = opts.contactFallback ? substitutePlaceholders(opts.contactFallback, row).text : ''
      return greetingFor({
        contact: row?.['Contact'], style: opts.contactStyle, language: opts.language,
        gender: opts.contactGender, fallback,
      })
    }
    const field = PLACEHOLDER_FIELDS[name]
    if (!field) return match // not one of ours — leave it alone
    const value = (row?.[field] ?? '').trim()

    if (name === 'contact') {
      if (value) return opts.contactStyle === 'first' ? firstNameOf(value) : value
      const fallback = String(opts.contactFallback || '')
      if (fallback) {
        // The fallback is itself a template ("{{venue}} Team"). Resolve it with
        // no options so a {{contact}} inside it can't recurse.
        const inner = substitutePlaceholders(fallback, row)
        inner.empties.filter(k => k !== 'contact').forEach(k => empties.add(k))
        return inner.text
      }
      empties.add(name)
      return ''
    }

    if (!value) empties.add(name)
    return value
  })
  return { text, empties: [...empties] }
}

// Substitution has to happen on the TipTap JSON's text nodes, before HTML is
// generated: a bold word inside "{{venue}}" would split the token across two
// text nodes in the rendered HTML, and a string replace would then miss it.
export function substituteDoc(doc, row, opts = {}) {
  const empties = new Set()

  // Attributes can carry placeholders too — a link href, a video URL.
  function walkAttrs(attrs) {
    if (!attrs || typeof attrs !== 'object') return attrs
    const out = {}
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'string' && v.includes('{{')) {
        const { text, empties: e } = substitutePlaceholders(v, row, opts)
        out[k] = text
        e.forEach(x => empties.add(x))
      } else {
        out[k] = v
      }
    }
    return out
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return node
    const next = { ...node }
    if (typeof next.text === 'string') {
      const { text, empties: e } = substitutePlaceholders(next.text, row, opts)
      next.text = text
      e.forEach(k => empties.add(k))
    }
    if (next.attrs) next.attrs = walkAttrs(next.attrs)
    // A link's href lives on the mark, not the node.
    if (Array.isArray(next.marks)) {
      next.marks = next.marks.map(m => (m?.attrs ? { ...m, attrs: walkAttrs(m.attrs) } : m))
    }
    if (Array.isArray(next.content)) next.content = next.content.map(walk)
    return next
  }

  return { doc: walk(doc), empties: [...empties] }
}

// Subject + body for one venue, with the union of everything that came back empty.
export function substituteTemplate(template, row, opts = {}) {
  const subject = substitutePlaceholders(template?.subject || '', row, opts)
  const body = substituteDoc(template?.bodyJSON || null, row, opts)
  return {
    subject: subject.text,
    bodyJSON: body.doc,
    empties: [...new Set([...subject.empties, ...body.empties])],
  }
}
