import { useEffect, useRef } from 'react'

// Select mode in the table: press on a row and drag across others to select
// (or, starting on a selected row, deselect) all of them; shift-click selects
// the range from the last row clicked. Rows are virtualised, so a range is
// worked out from row positions, not from what happens to be drawn — rows that
// scrolled out of view are part of it too. Dragging near the top or bottom
// edge of the window scrolls it — the top edge being the bottom of whatever is
// pinned there (toolbar and column headings), when something is.
//
// count            how many rows there are
// idsAt(i)         the _idx values row i stands for (a venue with several bands
//                  is one row with several entries)
// selected         the current selection (Set of _idx)
// setSelected(set) replaces it
// → onPointerDown(event, rowIndex), for each row.
const EDGE = 56 // px from the window edge where dragging scrolls
const SPEED = 14 // px per frame at the very edge

export function useDragSelect({ enabled, count, idsAt, selected, setSelected }) {
  const live = useRef({})
  live.current = { count, idsAt, selected, setSelected }
  const drag = useRef(null)
  const anchor = useRef(null) // the last row clicked, for shift-click

  function rangeIds(a, b) {
    const ids = []
    const { idsAt: at, count: n } = live.current
    for (let i = Math.max(0, Math.min(a, b)); i <= Math.min(n - 1, Math.max(a, b)); i++) ids.push(...at(i))
    return ids
  }

  function applyRange(base, from, to, on) {
    const next = new Set(base)
    for (const id of rangeIds(from, to)) {
      if (on) next.add(id)
      else next.delete(id)
    }
    live.current.setSelected(next)
  }

  // Where the rows start showing: below the stuck column headings, if any.
  function pinnedBottom() {
    const head = document.querySelector('thead th')
    return head ? Math.max(0, head.getBoundingClientRect().bottom) : 0
  }

  function rowAt(x, y) {
    const tr = document.elementFromPoint(x, y)?.closest?.('tr[data-index]')
    return tr ? Number(tr.dataset.index) : null
  }

  function stop() {
    const d = drag.current
    if (!d) return
    cancelAnimationFrame(d.frame)
    window.removeEventListener('pointermove', d.move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    document.body.style.userSelect = ''
    drag.current = null
  }

  function onPointerDown(e, index) {
    if (!enabled || e.button !== 0) return
    // The checkbox in the first column keeps working on its own.
    if (e.target.closest('input[type="checkbox"]')) return
    e.preventDefault()
    const { selected: sel, idsAt: at } = live.current
    if (e.shiftKey && anchor.current != null) {
      applyRange(sel, anchor.current, index, true)
      anchor.current = index
      return
    }
    anchor.current = index
    const on = !at(index).every(id => sel.has(id))
    const d = { from: index, to: index, on, base: new Set(sel), x: e.clientX, y: e.clientY, frame: 0 }
    d.move = ev => {
      d.x = ev.clientX
      d.y = ev.clientY
      follow()
    }
    const follow = () => {
      const i = rowAt(d.x, d.y)
      if (i == null || i === d.to) return
      d.to = i
      applyRange(d.base, d.from, d.to, d.on)
    }
    const tick = () => {
      const top = pinnedBottom()
      const dy = d.y < top + EDGE ? -(top + EDGE - d.y) : d.y > window.innerHeight - EDGE ? d.y - (window.innerHeight - EDGE) : 0
      if (dy) {
        window.scrollBy(0, Math.round((Math.min(EDGE, Math.abs(dy)) / EDGE) * SPEED) * Math.sign(dy))
        follow()
      }
      d.frame = requestAnimationFrame(tick)
    }
    drag.current = d
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', d.move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    d.frame = requestAnimationFrame(tick)
    applyRange(d.base, index, index, on)
  }

  // Leaving Select mode, or the table going away, ends a drag in progress.
  useEffect(() => {
    if (!enabled) anchor.current = null
    return stop
  }, [enabled])

  return onPointerDown
}
