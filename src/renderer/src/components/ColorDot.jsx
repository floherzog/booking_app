import { useEffect, useRef, useState } from 'react'
import { CHIP_HUES } from '@core/constants'
import { PALETTE } from '../lib/palette'

// A small dot in a chip's colour; clicking it opens the palette. `value` is the
// chosen hue (or nothing for the chip's own colour, drawn as `fallbackHex`);
// onChange gets a hue, or null for Default.
export default function ColorDot({ value, fallbackHex, label, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true) }
  }, [open])
  const hex = PALETTE[value]?.hex || fallbackHex
  const pick = hue => { onChange(hue); setOpen(false) }
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={`Colour of ${label}`}
        aria-label={`Colour of ${label}`}
        aria-expanded={open}
        className="w-4 h-4 rounded-full ring-1 ring-black/10 dark:ring-white/20 hover:scale-110 transition-transform"
        style={{ background: hex }}
      />
      {open && (
        <span className="absolute left-0 top-full mt-1.5 z-50 w-[11.5rem] p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          <span className="grid grid-cols-5 gap-1.5">
            {CHIP_HUES.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => pick(h)}
                title={h}
                aria-label={h}
                className={`w-7 h-7 rounded-full ${PALETTE[h].dot} ${value === h ? 'ring-2 ring-offset-2 ring-gray-700 dark:ring-gray-200 dark:ring-offset-gray-800' : 'hover:scale-110'} transition-transform`}
              />
            ))}
          </span>
          <button
            type="button"
            onClick={() => pick(null)}
            className={`mt-2 w-full text-xs rounded-md px-2 py-1 border ${!value ? 'border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300' : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300'}`}
          >
            Default
          </button>
        </span>
      )}
    </span>
  )
}
