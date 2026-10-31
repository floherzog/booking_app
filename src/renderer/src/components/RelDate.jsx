import { formatDistance, formatDistanceToNow, isToday, startOfToday } from 'date-fns'
import { de } from 'date-fns/locale'
import { parseDate } from '@core/parseDate'
import { useRules } from '../lib/rulesContext'
import { useT, getLanguage } from '../i18n'

// Only the draft log's ISO timestamps carry a time of day. Every CSV date is a
// bare day, which parses to midnight — measuring that against the clock reads
// "about 14 hours ago" for something that happened today.
function relLabel(raw, d, t) {
  const opts = { addSuffix: true, ...(getLanguage() === 'de' ? { locale: de } : {}) }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw.trim())) return formatDistanceToNow(d, opts)
  if (isToday(d)) return t('today')
  return formatDistance(d, startOfToday(), opts)
}

export default function RelDate({ raw, colorFn, row }) {
  // Every date color function takes (date, row, rules); passing the active rules
  // here keeps the TanStack column defs free of rule plumbing.
  const rules = useRules()
  const t = useT()
  const d = parseDate(raw)
  if (!d) return null
  return (
    <span className={`text-xs font-medium ${colorFn(d, row, rules)}`}>
      {relLabel(raw, d, t)}
    </span>
  )
}
