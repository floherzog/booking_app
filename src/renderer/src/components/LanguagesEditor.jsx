import { useState } from 'react'
import { t, useT } from '../i18n'

// Which email template language a venue gets, decided by its Country column.
// Anything not listed falls back to the default language.
const COMMON_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
]

export default function LanguagesEditor({ languages, onChange }) {
  const t = useT()
  const [newCountry, setNewCountry] = useState('')
  const [newLang, setNewLang] = useState('de')

  const rows = Object.entries(languages.map || {}).sort((a, b) => a[0].localeCompare(b[0]))

  function setMap(next) {
    onChange({ ...languages, map: next })
  }

  function addRow() {
    const country = newCountry.trim()
    if (!country) return
    setMap({ ...languages.map, [country]: newLang.trim().toLowerCase() || 'en' })
    setNewCountry('')
  }

  function updateRow(country, patch) {
    const next = { ...languages.map }
    if (patch.country !== undefined) {
      delete next[country]
      if (patch.country.trim()) next[patch.country] = languages.map[country]
    } else {
      next[country] = patch.language
    }
    setMap(next)
  }

  function removeRow(country) {
    const next = { ...languages.map }
    delete next[country]
    setMap(next)
  }

  const input = 'rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'

  // A free-text code is allowed; the list is just a shortcut.
  const langInput = (value, onSet) => (
    <input
      className={`${input} w-24`}
      list="booking-language-codes"
      value={value}
      onChange={e => onSet(e.target.value.trim().toLowerCase())}
      placeholder={t("de")}
    />
  )

  return (
    <div className="space-y-3">
      <datalist id="booking-language-codes">
        {COMMON_LANGUAGES.map(l => <option key={l.code} value={l.code}>{t(l.label)}</option>)}
      </datalist>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-200 flex-1">
          {t("Default language")}
          <span className="block text-xs text-gray-400 dark:text-gray-500">{t("Used for any country not listed below.")}</span>
        </label>
        {langInput(languages.default || 'en', v => onChange({ ...languages, default: v || 'en' }))}
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("No country overrides — every venue uses the default language.")}</p>
        )}
        {rows.map(([country, lang]) => (
          <div key={country} className="flex items-center gap-2">
            <input
              className={`${input} flex-1 min-w-0`}
              value={country}
              onChange={e => updateRow(country, { country: e.target.value })}
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>
            {langInput(lang, v => updateRow(country, { language: v }))}
            <button
              type="button"
              onClick={() => removeRow(country)}
              className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-1 rounded transition-colors"
              title={`Remove ${country}`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          className={`${input} flex-1 min-w-0`}
          placeholder={t("Add a country… (as spelled in the CSV)")}
          value={newCountry}
          onChange={e => setNewCountry(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
        />
        <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>
        {langInput(newLang, setNewLang)}
        <button
          type="button"
          onClick={addRow}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          {t("Add")}
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {t("Country names are matched case-insensitively, so list every spelling you actually use (“Germany” and “Deutschland” both need a row).")}
      </p>
    </div>
  )
}
