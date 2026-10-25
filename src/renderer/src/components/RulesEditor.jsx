import { useState } from 'react'
import { DEFAULT_RULES, BATCH_SORT_KEY_OPTIONS, validateRules } from '@core/rules'

// The numbers that actually change which venues get emailed. Everything here
// writes into one rules object; App persists it and reclassifies on the spot.
const NUMBERS = [
  { key: 'defaultFrequencyDays', label: 'Default re-contact window', unit: 'days', hint: 'Used when a venue has no Frequency of its own.' },
  { key: 'recentlyPlayedDays', label: 'Recently played', unit: 'days', hint: 'A gig this recent takes the venue out of outreach. An upcoming one is Confirmed.' },
  { key: 'holdOverrideDays', label: 'Hold expires after', unit: 'days', hint: 'A note with a hold keyword stops blocking once you last emailed this long ago.' },
  { key: 'festivalFutureMonths', label: 'Festival: too soon if within', unit: 'months', hint: 'A festival is bookable only when it is further out than this…' },
  { key: 'festivalPastMonths', label: 'Festival: still fresh for', unit: 'months', hint: '…or already further past than this.' },
  { key: 'batchSize', label: 'Next batch size', unit: 'venues', hint: 'How many action-needed venues the next-batch chip picks.' },
]

const DATE_COLORS = [
  { key: 'lastEmailedFreshRatio', label: 'Last emailed — green up to', unit: '× frequency', step: 0.1 },
  { key: 'lastEmailedWarnRatio', label: 'Last emailed — yellow up to', unit: '× frequency', step: 0.1 },
  { key: 'lastEmailedOverdueRatio', label: 'Last emailed — orange up to', unit: '× frequency', step: 0.1 },
  { key: 'lastPlayedRedDays', label: 'Last played — red below', unit: 'days' },
  { key: 'lastPlayedOrangeDays', label: 'Last played — orange below', unit: 'days' },
  { key: 'lastReplyGreenDays', label: 'Last reply — green up to', unit: 'days' },
  { key: 'lastReplyLimeDays', label: 'Last reply — lime up to', unit: 'days' },
  { key: 'lastReplyOrangeDays', label: 'Last reply — orange up to', unit: 'days' },
  { key: 'followUpDueRedAfterDays', label: 'Follow-up due — red after', unit: 'days overdue' },
  { key: 'followUpPendingGreenBeforeDays', label: 'Follow-up pending — green from', unit: 'days out' },
]

export default function RulesEditor({ rules, onChange }) {
  const [showColors, setShowColors] = useState(false)
  const errors = validateRules(rules)

  function set(key, value) {
    onChange({ ...rules, [key]: value })
  }

  function setColor(key, value) {
    onChange({ ...rules, dateColors: { ...rules.dateColors, [key]: value } })
  }

  // Keep the raw text so a half-typed number doesn't get clobbered mid-edit;
  // an unparseable value falls through to NaN and validateRules complains.
  function num(value, allowFloat) {
    const n = allowFloat ? parseFloat(value) : parseInt(value, 10)
    return Number.isNaN(n) ? '' : n
  }

  // --- hold keyword chips ----------------------------------------------------
  const [newKeyword, setNewKeyword] = useState('')

  function addKeyword() {
    const kw = newKeyword.trim().toLowerCase()
    if (!kw || rules.holdKeywords.includes(kw)) { setNewKeyword(''); return }
    set('holdKeywords', [...rules.holdKeywords, kw])
    setNewKeyword('')
  }

  function removeKeyword(kw) {
    set('holdKeywords', rules.holdKeywords.filter(k => k !== kw))
  }

  const numInput = 'w-24 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm text-right focus:border-indigo-500 focus:ring-indigo-500'
  const select = 'rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500'

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {NUMBERS.map(f => (
          <div key={f.key} className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <label className="block text-sm text-gray-700 dark:text-gray-200">{f.label}</label>
              <p className="text-xs text-gray-400 dark:text-gray-500">{f.hint}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <input
                type="number"
                min="0"
                className={numInput}
                value={rules[f.key]}
                onChange={e => set(f.key, num(e.target.value, false))}
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 w-12">{f.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm text-gray-700 dark:text-gray-200">Next batch sorted by</label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Applied in order — ties broken by the next column.</p>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <select
              key={i}
              className={`${select} flex-1`}
              value={rules.batchSortKeys[i] || ''}
              onChange={e => {
                const next = [...rules.batchSortKeys]
                if (e.target.value) next[i] = e.target.value
                else next.length = i // clearing a slot drops the ones after it too
                set('batchSortKeys', next.filter(Boolean))
              }}
            >
              <option value="">{i === 0 ? '—' : 'then… (none)'}</option>
              {BATCH_SORT_KEY_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-700 dark:text-gray-200">Hold keywords</label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
          A venue whose Note contains any of these is put On Hold. Matched lowercase, anywhere in the note.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {rules.holdKeywords.map(kw => (
            <span key={kw} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 leading-none px-0.5"
                title={`Remove "${kw}"`}
              >
                &times;
              </button>
            </span>
          ))}
          {rules.holdKeywords.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">No keywords — nothing is put on hold automatically.</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="Add a keyword…"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
          />
          <button
            type="button"
            onClick={addKeyword}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowColors(v => !v)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {showColors ? '▾' : '▸'} Advanced: date colours
        </button>
        {showColors && (
          <div className="mt-2 space-y-2 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Only affects how dates are tinted in the table — never which venues are picked.
            </p>
            {DATE_COLORS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300">{f.label}</label>
                <input
                  type="number"
                  min="0"
                  step={f.step || 1}
                  className={numInput}
                  value={rules.dateColors[f.key]}
                  onChange={e => setColor(f.key, num(e.target.value, !!f.step))}
                />
                <span className="text-xs text-gray-400 dark:text-gray-500 w-20 shrink-0">{f.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-700 dark:text-red-400">{e}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_RULES, dateColors: { ...DEFAULT_RULES.dateColors } })}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
      >
        Reset rules to defaults
      </button>
    </div>
  )
}
