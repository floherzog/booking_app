import { useEffect, useState } from 'react'
import { STATUS_META } from '@core/constants'
import { buildLogicNodes, describeWindow, describeBatchRule, TYPE_GATES } from '@core/logicTree'
import { setTypeRule, typeRuleFor } from '@core/venueTypes'
import { validateRules } from '@core/rules'
import { useRules, useClassifyCtx } from '../lib/rulesContext'
import RulesEditor from './RulesEditor'
import { useBackdropClose } from '../lib/useBackdropClose'
import { useEscape } from '../lib/useEscape'

// A leaf: either a status outcome (blue-ish status pill) or a "keep going" fall-through.
function Outcome({ value }) {
  if (typeof value === 'object') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-gray-600">
        ↓ {value.fall}
      </span>
    )
  }
  const meta = STATUS_META[value]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.badge}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      {meta.label}
    </span>
  )
}

// One labelled branch hanging off a vertical guide via an elbow tick.
function BranchRow({ label, muted, children }) {
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-3 w-5 h-px bg-gray-300 dark:bg-gray-600" aria-hidden />
      <div className="flex items-start gap-2 py-0.5">
        <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${muted ? 'text-rose-400 dark:text-rose-400/80' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {label}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
    </li>
  )
}

// Vertical guide that the BranchRow elbows hang from.
function Branches({ children }) {
  return (
    <ul className="relative mt-1.5 ml-1.5">
      <span className="absolute left-0 top-0 bottom-3 w-px bg-gray-300 dark:bg-gray-600" aria-hidden />
      {children}
    </ul>
  )
}

// A nested decision reached on a parent's "yes" branch: an orange sub-node then two leaves.
function SubDecision({ sub }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 dark:bg-orange-500 ring-2 ring-orange-100 dark:ring-orange-900/40 shrink-0" aria-hidden />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{sub.q}</span>
      </div>
      <Branches>
        <BranchRow label="yes"><Outcome value={sub.yes} /></BranchRow>
        <BranchRow label="no" muted><Outcome value={sub.no} /></BranchRow>
      </Branches>
    </div>
  )
}

// "Type is [festival ×] [+ type]": the types a gate applies to, as chips. With
// `onChange` (Settings ▸ Rules ▸ Flow) they can be added and removed, which
// edits the types' rules — the same ones Settings ▸ Venue types shows.
function TypeGateQuestion({ node, typeRules, venueTypes = [], bandNames = [], onChange }) {
  const gate = TYPE_GATES[node.gate]
  const others = venueTypes.filter(t => !node.types.includes(t.toLowerCase()))
  const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
        <span>Type is</span>
        {node.types.length === 0 && <span className="text-gray-400 dark:text-gray-500 font-normal">(no type)</span>}
        {node.types.map((t, i) => (
          <span key={t} className="inline-flex items-center gap-1">
            {i > 0 && <span className="font-normal text-gray-400">or</span>}
            <span className={chip}>
              {t}
              {onChange && (
                <button type="button" onClick={() => onChange(setTypeRule(typeRules, t, gate.remove))}
                  className="text-gray-400 hover:text-red-500 leading-none" title={`Take “${t}” out of this gate`} aria-label={`Remove ${t}`}>×</button>
              )}
            </span>
          </span>
        ))}
        {onChange && others.length > 0 && (
          <select
            value=""
            onChange={e => e.target.value && onChange(setTypeRule(typeRules, e.target.value, gate.add))}
            className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-xs py-0.5 pl-2 pr-7"
            aria-label="Add a venue type to this gate"
          >
            <option value="">+ type…</option>
            {others.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {node.rest && <span>{node.rest}</span>}
        <span>?</span>
      </div>
      {onChange && node.gate === 'bands' && node.types.map(t => {
        const booked = typeRuleFor(typeRules, t).bands || []
        return (
          <div key={t} className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono">{t}</span> is booked by
            {bandNames.length === 0 && <span>— no bands yet</span>}
            {bandNames.map(name => {
              const on = booked.some(b => b.toLowerCase() === name.toLowerCase())
              return (
                <button key={name} type="button" aria-pressed={on}
                  onClick={() => onChange(setTypeRule(typeRules, t, {
                    bands: on ? booked.filter(b => b.toLowerCase() !== name.toLowerCase()) : [...booked, name],
                  }))}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${on
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}>
                  {name}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function Gate({ node, isLast, typeProps }) {
  return (
    <div className="flex gap-3">
      {/* Trunk: orange decision node + the "no" connector down to the next gate */}
      <div className="flex flex-col items-center shrink-0">
        <span className="mt-1 w-4 h-4 rounded-full bg-orange-400 dark:bg-orange-500 ring-4 ring-orange-100 dark:ring-orange-900/30 z-10" aria-hidden />
        {!isLast && (
          <div className="relative flex-1 w-px bg-gray-300 dark:bg-gray-600 my-1">
            {/* At the foot of the connector, in the gap between gates, so a tall
                gate's text never runs into it. */}
            <span className="absolute bottom-1 left-1.5 text-[9px] font-bold uppercase tracking-wider text-rose-400 dark:text-rose-400/80">no</span>
          </div>
        )}
      </div>

      {/* Gate content + its yes-branch(es) */}
      <div className={isLast ? 'flex-1 min-w-0' : 'flex-1 min-w-0 pb-6'}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
            {node.col}
          </span>
          {node.gate
            ? <TypeGateQuestion node={node} {...typeProps} />
            : <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{node.q}?</span>}
        </div>
        {node.note && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{node.note}</p>
        )}

        {node.terminal ? (
          <Branches>
            <BranchRow label="yes"><Outcome value={node.yes} /></BranchRow>
            <BranchRow label="no" muted><Outcome value={node.no} /></BranchRow>
          </Branches>
        ) : node.sub ? (
          <Branches>
            <BranchRow label="yes"><SubDecision sub={node.sub} /></BranchRow>
          </Branches>
        ) : (
          <Branches>
            <BranchRow label="yes"><Outcome value={node.yes} /></BranchRow>
          </Branches>
        )}
      </div>
    </div>
  )
}

// The diagram on its own: every venue at the top, then each gate in order.
// Settings ▸ Rules shows it too, drawn from the numbers being edited there, and
// there the type gates are editable (`onTypeRulesChange`).
export function LogicFlow({ rules, typeRules, venueTypes, bandNames, onTypeRulesChange }) {
  const saved = useClassifyCtx().typeRules
  const activeTypeRules = typeRules || saved
  const nodes = buildLogicNodes(rules, activeTypeRules)
  const typeProps = { typeRules: activeTypeRules, venueTypes, bandNames, onChange: onTypeRulesChange }
  return (
    <>
      {/* Root */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center shrink-0">
          <span className="mt-1 w-4 h-4 rounded-full bg-gray-700 dark:bg-gray-200 ring-4 ring-gray-200 dark:ring-gray-700 z-10" aria-hidden />
          <div className="flex-1 w-px bg-gray-300 dark:bg-gray-600 my-1 min-h-[14px]" />
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">Every venue</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Evaluated top to bottom.</p>
        </div>
      </div>

      {nodes.map((node, i) => (
        <Gate key={i} node={node} isLast={i === nodes.length - 1} typeProps={typeProps} />
      ))}
    </>
  )
}

export default function LogicModal({ onClose, onSaveRules }) {
  const backdrop = useBackdropClose(onClose)
  useEscape(onClose)
  const rules = useRules()
  const [tab, setTab] = useState('flow')
  // The diagram renders from the draft, so editing a number redraws the gates it
  // affects straight away — that is the whole reason these two live together now.
  const [draft, setDraft] = useState(rules)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  const dirty = JSON.stringify(draft) !== JSON.stringify(rules)
  const ruleErrors = validateRules(draft)
  const editable = typeof onSaveRules === 'function'

  // Adopt whatever was persisted, unless there are unsaved edits in flight.
  useEffect(() => { if (!dirty) setDraft(rules) }, [rules]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(0), 2500)
    return () => clearTimeout(t)
  }, [savedAt])

  async function save() {
    if (ruleErrors.length) return
    setSaving(true)
    setError('')
    try {
      await onSaveRules(draft)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const tabBtn = active => `px-3 py-1 text-sm rounded-md transition-colors ${active
    ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100] p-4"
      // Closing on a stray backdrop click is fine while only reading, but it must
      // never throw away unsaved rule edits.
      {...(dirty ? {} : backdrop)}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {tab === 'flow' ? 'How venues get classified' : 'The numbers behind it'}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {tab === 'flow'
                ? 'First gate that matches wins — the orange trunk continues on "no"'
                : 'Change a number and the flow above updates with it'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && (
              <div className="flex gap-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-0.5">
                <button type="button" onClick={() => setTab('flow')} className={tabBtn(tab === 'flow')}>Flow</button>
                <button type="button" onClick={() => setTab('rules')} className={tabBtn(tab === 'rules')}>
                  Rules{ruleErrors.length > 0 && <span className="ml-1 text-red-400">•</span>}
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {tab === 'rules' ? (
            <RulesEditor rules={draft} onChange={setDraft} />
          ) : (
            <LogicFlow rules={draft} />
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
          {tab === 'flow' && (
            <div className="flex items-center gap-4 mb-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> gate</span>
              <span className="inline-flex items-center gap-1.5"><span className="text-emerald-600 dark:text-emerald-400 font-bold">yes</span> / <span className="text-rose-400 font-bold">no</span> branch</span>
              <span className="inline-flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">pill</span> outcome</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400 dark:text-gray-500 min-w-0">
              {error ? <span className="text-red-500">{error}</span>
                : ruleErrors.length > 0 ? <span className="text-red-500">{ruleErrors[0]}</span>
                : savedAt ? <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                : dirty ? 'Unsaved changes'
                : <>{describeWindow(draft)} {describeBatchRule(draft)} "Action needed" = Send + Follow up + Never contacted.</>}
            </p>
            {editable && (
              <div className="flex items-center gap-2 shrink-0">
                {dirty && (
                  <button
                    type="button"
                    onClick={() => setDraft(rules)}
                    className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 transition-colors"
                  >
                    Revert
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || saving || ruleErrors.length > 0}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
