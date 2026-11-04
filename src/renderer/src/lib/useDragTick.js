import { useEffect, useRef } from 'react'

// Ticking a list of checkboxes by dragging: press on one box, and every row the
// pointer then passes over gets the state that first box switched to — ticked
// or unticked — until the button is released. A plain click and the keyboard
// still toggle one box. Mouse and trackpad only: on a touch screen a drag
// scrolls.
//
// isOn(key) → boolean, setOn(key, value). → bind(key, { enabled }) giving
// { box, row } props: `box` for the checkbox, `row` for the row around it.
export function useDragTick(isOn, setOn) {
  const drag = useRef(null) // { value } while a drag is on
  const pressed = useRef(false) // the press already toggled: skip the click's onChange
  const latest = useRef({ isOn, setOn })
  latest.current = { isOn, setOn }

  useEffect(() => {
    const end = () => {
      if (drag.current) {
        drag.current = null
        document.body.style.userSelect = ''
      }
      // The click that follows the release comes before this runs.
      setTimeout(() => { pressed.current = false }, 0)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      end()
    }
  }, [])

  return (key, { enabled = true } = {}) => ({
    box: {
      checked: isOn(key),
      onPointerDown: e => {
        if (!enabled || e.button !== 0 || e.pointerType === 'touch') return
        const value = !latest.current.isOn(key)
        drag.current = { value }
        pressed.current = true
        document.body.style.userSelect = 'none'
        latest.current.setOn(key, value)
      },
      onChange: () => {
        if (pressed.current) { pressed.current = false; return }
        latest.current.setOn(key, !latest.current.isOn(key))
      },
    },
    row: {
      onPointerEnter: () => {
        if (enabled && drag.current) latest.current.setOn(key, drag.current.value)
      },
    },
  })
}
