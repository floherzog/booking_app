import { useEffect, useRef } from 'react'

// Escape closes the topmost open dialog only: Settings opened over the venue
// panel closes first, the panel on the next press. Dialogs register in the
// order they open. A field that handles Escape itself (cancelling an edit, a
// date being typed, an inline prompt) calls preventDefault, and then nothing
// closes.
const stack = []

function onKeyDown(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top.current?.()
}

export function useEscape(onClose, enabled = true) {
  const ref = useRef(onClose)
  useEffect(() => { ref.current = onClose })
  useEffect(() => {
    if (!enabled) return
    stack.push(ref)
    if (stack.length === 1) window.addEventListener('keydown', onKeyDown)
    return () => {
      const i = stack.lastIndexOf(ref)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled])
}
