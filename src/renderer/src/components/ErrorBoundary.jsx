import { Component } from 'react'
import { t, useT } from '../i18n'

// A render error anywhere used to unmount the whole tree and leave a blank
// window. Wrapped around a part of the UI, this keeps the rest — and App's
// unsaved edits — alive and says what went wrong instead.
//
// `fallback({ error, reset })` draws the replacement; without one, a plain
// message with a Reload button (the last resort around the whole app).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Booking] render error', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const reset = () => this.setState({ error: null })
    if (this.props.fallback) return this.props.fallback({ error, reset })
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-lg space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p className="font-semibold text-red-700 dark:text-red-400">{t("Something went wrong.")}</p>
          <p className="font-mono text-xs break-words bg-red-50 dark:bg-red-900/20 rounded p-2">{String(error?.message || error)}</p>
          <p>{t("Unsaved edits could not be kept. Your CSV itself is untouched.")}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            {t("Reload")}
          </button>
        </div>
      </div>
    )
  }
}
