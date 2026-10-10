import { useRef } from 'react'

// Click-outside-to-close that ignores a drag. Selecting text in a field and
// letting go of the mouse over the dimmed backdrop ends in a click *on the
// backdrop* — the browser sends it to the element both the press and the
// release were over — which closed the dialog in the middle of a copy-paste.
// Only a press that also started on the backdrop counts.
// Spread the result onto the backdrop element.
export function useBackdropClose(onClose) {
  const pressedOnBackdrop = useRef(false)
  return {
    onMouseDown: e => { pressedOnBackdrop.current = e.target === e.currentTarget },
    onClick: e => {
      const close = pressedOnBackdrop.current && e.target === e.currentTarget
      pressedOnBackdrop.current = false
      if (close) onClose()
    },
  }
}
