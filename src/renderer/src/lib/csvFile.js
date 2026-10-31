import { serializeCsv } from '@core/csv'
import { api } from '../platform'
import { t } from '../i18n'

// Local YYYY-MM-DD stamp for the export filename (avoids UTC/locale surprises).
function dateStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Serialize the current rows (internal _ fields stripped by serializeCsv) and
// write them wherever the user points the native save dialog.
export async function exportCsv(rows, filename) {
  const text = serializeCsv(rows)
  return api.exportCsv(text, filename || `booking_${dateStamp()}.csv`)
}

// Read a File/Blob as UTF-8 text (the import wizard's drag-and-drop path).
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error(t('Could not read file')))
    reader.readAsText(file)
  })
}
