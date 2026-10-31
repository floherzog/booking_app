import { statusMeta, useChipColors } from '../lib/palette'

export default function StatusBadge({ status }) {
  useChipColors()
  const meta = statusMeta(status)
  if (!meta.label) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${meta.badge}`}>
      {meta.label}
    </span>
  )
}
