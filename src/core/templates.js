import { applyGermanArticles, hasArticlePlaceholder } from './germanArticles.js'
import { plainT } from './tr.js'
import { datesForVenue } from './venueDates.js'

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

// German names for the same placeholders. A template may use either; they are
// turned into the English ones before anything else reads the text, so every
// template works whatever language the app is shown in. {{venue}}, {{band}}
// and {{text}} are the same in both.
export const GERMAN_PLACEHOLDERS = {
  greeting: 'begrüßung',
  contact: 'kontakt',
  city: 'stadt',
  country: 'land',
  dates: 'termine',
  article: 'artikel',
}
const FROM_GERMAN = {
  ...Object.fromEntries(Object.entries(GERMAN_PLACEHOLDERS).map(([en, de]) => [de, en])),
  begruessung: 'greeting',
}
const ANY_PLACEHOLDER_RE = /\{\{\s*([\p{L}]+)\s*\}\}/gu

// {{kontakt}} → {{contact}}, and so on; anything else is left as written.
export function canonicalPlaceholders(text) {
  return String(text ?? '').replace(ANY_PLACEHOLDER_RE, (m, name) => {
    const en = FROM_GERMAN[name.toLowerCase()]
    return en ? `{{${en}}}` : m
  })
}

// What a placeholder is called in the given UI language: 'greeting' → 'begrüßung'.
export function placeholderName(key, language) {
  return (language === 'de' && GERMAN_PLACEHOLDERS[key]) || key
}

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
  // {{dates}} narrowed to what the venue's Time Frame allows (venueDates.js):
  // its weekdays or its own dates. Off: the Dates go out as written.
  fitDates: false,
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
    fitDates: opts.fitDates === true,
  }
}

// A Contact cell can name several people: "Anna Müller & Ben Schulz",
// "Anna und Ben", "Anna / Ben", "Anna Müller, Ben Schulz" → one entry each.
// A comma between two one-word parts ("Müller, Anna") or after a surname with
// a particle ("van der Berg, Jan") is still one person, surname first —
// unless the cell also has an "and" (then commas list people too).
const CONTACT_SEPARATORS = /\s*(?:&|\+|\/|;|\n)\s*|\s+(?:and|und|et)\s+/i
export function splitContacts(value) {
  const parts = String(value || '').split(CONTACT_SEPARATORS).map(p => p.trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean)
  const out = []
  for (const part of parts) {
    const pieces = part.split(',').map(x => x.trim()).filter(Boolean)
    const first = pieces[0]?.split(/\s+/) || []
    const isList = pieces.length > 2 || (pieces.length === 2 && (parts.length > 1
      || (first.length > 1 && !SURNAME_PARTICLES.has(first[0].toLowerCase()))))
    if (isList) out.push(...pieces)
    else out.push(pieces.join(', '))
  }
  return [...new Set(out)]
}

// "Anna", "Anna and Ben", "Anna, Ben and Carla" — in the template's language.
const AND = { en: 'and', de: 'und' }
export function joinNames(list, language = 'en') {
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} ${AND[language] || '&'} ${list[list.length - 1]}`
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
//
// Several people in the Contact cell (splitContacts) are greeted together;
// `gender` is then one entry per person, in order. German gives each their
// own salutation when every gender is known ("Liebe Anna, lieber Ben"),
// otherwise one neutral one ("Hallo Anna und Ben"); English has one "Dear"
// ("Dear Anna and Ben", "Dear Ms Müller and Mr Schulz").
export function greetingFor({ contact, style = 'full', language = 'en', gender, fallback = '' }) {
  const g = GREETINGS[language] || GREETINGS.en
  const people = splitContacts(contact)
  const forms = g[style === 'formal' ? 'formal' : 'informal']
  if (!people.length) return fallback ? forms.team(fallback) : forms.none()
  const genders = Array.isArray(gender) ? gender : [gender]
  const sexOf = i => (genders[i] === 'f' || genders[i] === 'm' ? genders[i] : 'x')
  const nameFor = (n, sex) => (style === 'formal' ? (sex === 'x' ? n : lastNameOf(n)) : style === 'first' ? firstNameOf(n) : n)
  if (people.length === 1) return forms[sexOf(0)](nameFor(people[0], sexOf(0)))
  if (g === GREETINGS.de) {
    if (people.every((_, i) => sexOf(i) !== 'x')) {
      return people.map((n, i) => {
        const one = forms[sexOf(i)](nameFor(n, sexOf(i)))
        return i ? one[0].toLowerCase() + one.slice(1) : one
      }).join(', ')
    }
    return forms.x(joinNames(people.map(n => nameFor(n, 'x')), 'de'))
  }
  const named = people.map((n, i) => {
    const sex = sexOf(i)
    return style === 'formal' && sex !== 'x' ? `${sex === 'f' ? 'Ms' : 'Mr'} ${nameFor(n, sex)}` : nameFor(n, sex)
  })
  return `Dear ${joinNames(named, 'en')}`
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
// UI can warn before a draft goes out in the wrong language. `t` translates
// the reasons (tr.js).
export function resolveTemplate(templates, row, languages, t = plainT) {
  const band = row?.['Band'] || ''
  const language = languageForRow(row, languages)
  const defaultLanguage = norm(languages?.default) || 'en'
  const list = templates || []

  if (!band) {
    return { template: null, language, fallbackUsed: false, reason: t('This venue has no band set.') }
  }

  const forBand = list.filter(t => t.band === band)
  if (forBand.length === 0) {
    return { template: null, language, fallbackUsed: false, reason: t('No templates for “{band}” yet.', { band }) }
  }

  const exact = forBand.find(t => norm(t.language) === language)
  if (exact) return { template: exact, language, fallbackUsed: false, reason: '' }

  const fallback = forBand.find(t => norm(t.language) === defaultLanguage)
  if (fallback) {
    return {
      template: fallback,
      language: defaultLanguage,
      fallbackUsed: true,
      reason: t('No “{language}” template for {band} — using “{fallback}”.', { language, band, fallback: defaultLanguage }),
    }
  }

  return {
    template: null,
    language,
    fallbackUsed: false,
    reason: t('No “{language}” or “{fallback}” template for {band}.', { language, band, fallback: defaultLanguage }),
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
  let source = canonicalPlaceholders(str)
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
    // {{dates}}: with `fitDates` (Settings ▸ Mail templates), the band's Dates
    // narrowed to the venue's weekdays or own dates from its Time Frame
    // (venueDates.js).
    const value = name === 'dates' && opts.fitDates
      ? datesForVenue(row?.[field], row?.['Time Frame']).text
      : (row?.[field] ?? '').trim()

    if (name === 'contact') {
      if (value) {
        // Several people: each by the chosen style, joined ("Anna und Ben").
        if (!opts.contactStyle) return value
        const people = splitContacts(value)
        return joinNames(opts.contactStyle === 'first' ? people.map(firstNameOf) : people, opts.language)
      }
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
