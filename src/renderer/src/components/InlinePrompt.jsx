import { useState, useRef, useCallback, useEffect } from 'react'
import { useEscape } from '../lib/useEscape'

// Electron does not implement window.prompt() — it is a silent no-op, which is
// why the link and video buttons appeared to do nothing. This is the in-app
// replacement: `ask()` returns a promise that resolves with the entered string,
// '' if the field was cleared, or null if the user cancelled — the same three
// outcomes the old window.prompt calls were already written against.
export function useInlinePrompt() {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)
  const inputRef = useRef(null)

  const ask = useCallback(opts => {
    return new Promise(resolve => {
      resolveRef.current = resolve
      setState({
        label: 'Value',
        initial: '',
        placeholder: '',
        confirmLabel: 'OK',
        hint: '',
        ...(typeof opts === 'string' ? { label: opts } : opts),
      })
    })
  }, [])

  function finish(value) {
    const resolve = resolveRef.current
    resolveRef.current = null
    setState(null)
    resolve?.(value)
  }

  const node = state ? (
    <PromptDialog state={state} inputRef={inputRef} onCancel={() => finish(null)} onConfirm={finish} />
  ) : null

  return [node, ask]
}

function PromptDialog({ state, inputRef, onCancel, onConfirm }) {
  const [value, setValue] = useState(state.initial || '')

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [inputRef])

  return (
    // z above the modals this can be opened from (SettingsPanel/Templates are 1100).
    <div
      className="fixed inset-0 z-[1300] flex items-start justify-center bg-black/30 p-4 pt-40"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{state.label}</label>
        <input
          ref={inputRef}
          value={value}
          placeholder={state.placeholder}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(value) }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
        {state.hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{state.hint}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value)}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// The in-app replacement for window.confirm, whose macOS sheet looks like
// nothing else in the app. `confirm({ title, message, choices })` resolves
// with the `value` of the button pressed, or null for Cancel, Esc or a click
// outside. `choices` run from least to most emphatic; the last is the primary
// button. Plain `confirm('Question?')` gives OK / Cancel and resolves true/null.
export function useConfirm() {
  const [state, setState] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback(opts => new Promise(resolve => {
    resolveRef.current = resolve
    const o = typeof opts === 'string' ? { title: opts } : opts
    setState({ cancelLabel: 'Cancel', choices: [{ value: true, label: 'OK' }], ...o })
  }), [])

  function finish(value) {
    const resolve = resolveRef.current
    resolveRef.current = null
    setState(null)
    resolve?.(value)
  }

  const node = state ? <ConfirmDialog state={state} onDone={finish} /> : null
  return [node, confirm]
}

function ConfirmDialog({ state, onDone }) {
  useEscape(() => onDone(null))
  const primaryRef = useRef(null)
  useEffect(() => { primaryRef.current?.focus() }, [])
  const last = state.choices.length - 1
  return (
    <div
      className="fixed inset-0 z-[1300] flex items-start justify-center bg-black/30 p-4 pt-40"
      onMouseDown={e => { if (e.target === e.currentTarget) onDone(null) }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{state.title}</p>
        {state.message && <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{state.message}</p>}
        <div className="mt-4 flex flex-wrap justify-end items-center gap-3">
          <button type="button" onClick={() => onDone(null)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mr-auto">
            {state.cancelLabel}
          </button>
          {state.choices.map((c, i) => (
            <button
              key={String(c.value)}
              ref={i === last ? primaryRef : undefined}
              type="button"
              onClick={() => onDone(c.value)}
              className={i === last
                ? 'bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors'
                : 'text-sm font-medium px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500'}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
