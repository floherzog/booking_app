import { formatText } from '../core/tr.js'

// The few things the main process says itself — the menu and the update
// dialogs — in the language the window picked (Settings ▸ General ▸ Language).
// The window tells us over `app:setLanguage`; until then, English.
const DE = {
  'About {name}': 'Über {name}',
  'Check for Updates…': 'Nach Updates suchen …',
  Services: 'Dienste',
  'Hide {name}': '{name} ausblenden',
  'Hide Others': 'Andere ausblenden',
  'Show All': 'Alle einblenden',
  'Quit {name}': '{name} beenden',
  'Close Window': 'Fenster schließen',
  Edit: 'Bearbeiten',
  Undo: 'Widerrufen',
  Redo: 'Wiederholen',
  Cut: 'Ausschneiden',
  Copy: 'Kopieren',
  Paste: 'Einsetzen',
  'Paste and Match Style': 'Einsetzen und Stil anpassen',
  Delete: 'Löschen',
  'Select All': 'Alles auswählen',
  Reload: 'Neu laden',
  'Force Reload': 'Neu laden erzwingen',
  'Toggle Developer Tools': 'Entwicklerwerkzeuge',
  'Actual Size': 'Originalgröße',
  'Zoom In': 'Vergrößern',
  'Zoom Out': 'Verkleinern',
  'Toggle Full Screen': 'Vollbildmodus',
  Window: 'Fenster',
  Minimize: 'Im Dock ablegen',
  Zoom: 'Zoomen',
  'Bring All to Front': 'Alle nach vorne bringen',
  'Settings…': 'Einstellungen …',
  File: 'Ablage',
  'Email Templates…': 'E-Mail-Vorlagen …',
  View: 'Darstellung',
  'Could not check for updates': 'Updates konnten nicht geprüft werden',
  'Booking {version} is up to date.': 'Booking {version} ist aktuell.',
  'The latest published release is {version}.': 'Die neueste veröffentlichte Version ist {version}.',
  OK: 'OK',
}

let language = 'en'

export function setMainLanguage(lang) {
  language = lang === 'de' ? 'de' : 'en'
}

export function tm(text, vars) {
  return formatText(language === 'de' ? (DE[text] ?? text) : text, vars)
}
