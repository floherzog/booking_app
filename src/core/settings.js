import { mergeRules, DEFAULT_RULES } from './rules.js'
import { normalizeBands } from './bands.js'
import { normalizeVenueTypes, DEFAULT_VENUE_TYPES } from './venueTypes.js'
import { normalizeAccounts } from './mailAccounts.js'
import { DEFAULT_TEMPLATE_OPTIONS } from './templates.js'
import { normalizeFilterChips } from './filterRows.js'

// The settings shape and its normalisation, shared by both builds: the Mac app
// keeps it in userData/settings.json (src/main/settingsStore.js), the web build
// on the server through settings.php (src/renderer/src/platform/web.js).

// Small, human-readable, and easy to back up — the CSV remains the only file
// that matters for the venue data itself.
export const DEFAULT_SETTINGS = {
  storage: {
    adapter: 'file',           // 'file' | 'github'
    filePath: '',              // absolute path to the semicolon CSV
    github: { repo: '', path: '' },
    // Multi-band mode (local file only): one CSV per band plus one for venues
    // without a band, all in `dir`. `files` maps band name → path; `sourcePath`
    // is the single CSV they were split from, and where switching off merges to.
    multiBand: { enabled: false, dir: '', base: '', files: {}, unassigned: '', sourcePath: '' },
  },
  rules: DEFAULT_RULES,
  bands: [],
  venueTypes: DEFAULT_VENUE_TYPES,
  templates: DEFAULT_TEMPLATE_OPTIONS,
  languages: {
    default: 'en',
    map: {
      Germany: 'de', Deutschland: 'de',
      Austria: 'de', 'Österreich': 'de',
      Switzerland: 'de', Schweiz: 'de',
    },
  },
  mail: {
    // One entry per mailbox the app sends from; bands pick one by id. The first
    // is the default. Each carries its own IMAP and SMTP settings and its own
    // keychain entry — see src/core/mailAccounts.js.
    accounts: [],
    // Keeping the CSV's date columns in step with the mail account. Nothing here
    // ever writes a row directly — a sync stages edits you confirm with Save.
    sync: {
      lastEmailed: 'onSend',   // 'off' | 'onSend' (stamp today when drafting/sending) | 'imap'
      replies: 'off',          // 'off' | 'imap'
      months: 24,              // how far back a scan looks
      onOpen: true,            // run the configured scans once after load
    },
  },
  general: {
    autoCheckUpdates: true,
  },
  dismissedDupes: [],
  draftLog: {},                // 'Venue||City||Band' → ISO timestamp
  // The chips above the list: default ones switched off, and saved filter sets.
  filterChips: { hidden: [], custom: [] },
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// Shallow-merge each top-level section over its defaults, so a settings file
// written by an older version never loses a newly-added key.
export function normalizeSettings(stored) {
  const s = isPlainObject(stored) ? stored : {}
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    storage: {
      ...DEFAULT_SETTINGS.storage,
      ...(s.storage || {}),
      github: { ...DEFAULT_SETTINGS.storage.github, ...(s.storage?.github || {}) },
      multiBand: {
        ...DEFAULT_SETTINGS.storage.multiBand,
        ...(s.storage?.multiBand || {}),
        files: isPlainObject(s.storage?.multiBand?.files) ? s.storage.multiBand.files : {},
      },
    },
    rules: mergeRules(s.rules),
    bands: normalizeBands(s.bands),
    // An empty/absent list means "never configured" → fall back to the defaults,
    // so an older settings.json still offers main/festival/dead.
    venueTypes: normalizeVenueTypes(s.venueTypes).length
      ? normalizeVenueTypes(s.venueTypes)
      : [...DEFAULT_VENUE_TYPES],
    templates: {
      ...DEFAULT_TEMPLATE_OPTIONS,
      ...(s.templates || {}),
      contactFallbacks: {
        ...DEFAULT_TEMPLATE_OPTIONS.contactFallbacks,
        ...(isPlainObject(s.templates?.contactFallbacks) ? s.templates.contactFallbacks : {}),
      },
      video: {
        ...DEFAULT_TEMPLATE_OPTIONS.video,
        ...(isPlainObject(s.templates?.video) ? s.templates.video : {}),
      },
    },
    languages: {
      default: s.languages?.default || DEFAULT_SETTINGS.languages.default,
      map: isPlainObject(s.languages?.map) ? s.languages.map : { ...DEFAULT_SETTINGS.languages.map },
    },
    mail: {
      sync: { ...DEFAULT_SETTINGS.mail.sync, ...(isPlainObject(s.mail?.sync) ? s.mail.sync : {}) },
      // Reads both shapes: a stored `accounts` list, or the flat host/user/…
      // fields written before accounts existed, which become the first account.
      // The flat fields are deliberately not carried forward, so there is only
      // ever one source of truth after the first save.
      accounts: normalizeAccounts(s.mail),
    },
    general: { ...DEFAULT_SETTINGS.general, ...(isPlainObject(s.general) ? s.general : {}) },
    dismissedDupes: Array.isArray(s.dismissedDupes) ? s.dismissedDupes : [],
    draftLog: isPlainObject(s.draftLog) ? s.draftLog : {},
    filterChips: normalizeFilterChips(s.filterChips),
  }
}
