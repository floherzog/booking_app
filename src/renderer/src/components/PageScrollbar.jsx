import { useEffect, useRef } from 'react'

// The Mac window's scrollbar (index.css hides the page's own). The page still
// scrolls as a whole — momentum, bounce and the sliding toolbar stay as they
// are — but the bar starts where the list starts (`anchorRef`, measured with
// the page at the top), not beside the header and under the traffic lights.
// Like a macOS overlay scrollbar it shows while scrolling and fades after a
// second; hovering widens it, the thumb can be dragged, and a click on the
// track moves a page. Positions are set straight on the elements, so
// scrolling never re-renders React.
const GAP = 4      // px below the track
const MIN_THUMB = 32
const FADE_MS = 1000

export default function PageScrollbar({ anchorRef }) {
  const trackRef = useRef(null)
  const thumbRef = useRef(null)

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return
    const doc = document.documentElement
    let top = 0          // where the track starts, px from the window's top
    let frame = 0
    let fade = 0
    let hover = false
    let drag = null      // { y, from } while the thumb is held

    const geometry = () => {
      const max = doc.scrollHeight - window.innerHeight
      const trackH = window.innerHeight - top - GAP
      const thumbH = Math.max(MIN_THUMB, Math.round(trackH * window.innerHeight / doc.scrollHeight))
      return { max, trackH, thumbH }
    }
    const measure = () => {
      const el = anchorRef.current
      const chrome = parseFloat(getComputedStyle(doc).getPropertyValue('--chrome-top')) || 0
      const at = el ? el.getBoundingClientRect().top + window.scrollY : chrome
      // Never so far down that the bar gets too short to use.
      top = Math.round(Math.max(chrome, Math.min(at, window.innerHeight * 0.4)))
    }
    const place = () => {
      frame = 0
      const { max, trackH, thumbH } = geometry()
      const usable = max > 1 && trackH > thumbH
      track.style.display = usable ? '' : 'none'
      if (!usable) return
      track.style.top = `${top}px`
      track.style.height = `${trackH}px`
      // Past either end (the bounce) the thumb just waits at that end.
      const p = Math.min(1, Math.max(0, window.scrollY / max))
      thumb.style.height = `${thumbH}px`
      thumb.style.transform = `translateY(${Math.round((trackH - thumbH) * p)}px)`
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place) }
    const show = () => {
      track.dataset.visible = 'true'
      clearTimeout(fade)
      if (!hover && !drag) fade = setTimeout(() => { delete track.dataset.visible }, FADE_MS)
    }
    const onScroll = () => { schedule(); show() }
    const relayout = () => { measure(); schedule() }

    const onEnter = () => { hover = true; track.dataset.hover = 'true'; show() }
    const onLeave = () => { hover = false; delete track.dataset.hover; show() }
    const onThumbDown = e => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      thumb.setPointerCapture(e.pointerId)
      drag = { y: e.clientY, from: window.scrollY }
      track.dataset.drag = 'true'
      show()
    }
    const onThumbMove = e => {
      if (!drag) return
      const { max, trackH, thumbH } = geometry()
      window.scrollTo(0, drag.from + (e.clientY - drag.y) * max / Math.max(1, trackH - thumbH))
    }
    const onThumbUp = () => {
      if (!drag) return
      drag = null
      delete track.dataset.drag
      show()
    }
    // A click beside the thumb moves one page that way.
    const onTrackDown = e => {
      if (e.button !== 0 || e.target === thumb) return
      e.preventDefault()
      const above = e.clientY < thumb.getBoundingClientRect().top
      window.scrollBy({ top: (above ? -1 : 1) * window.innerHeight * 0.9, behavior: 'smooth' })
    }

    relayout()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', relayout)
    // The header changes height (banners in it, the window narrower) and the
    // page grows and shrinks with the list.
    const ro = new ResizeObserver(relayout)
    ro.observe(document.body)
    if (anchorRef.current) ro.observe(anchorRef.current)
    track.addEventListener('pointerenter', onEnter)
    track.addEventListener('pointerleave', onLeave)
    track.addEventListener('pointerdown', onTrackDown)
    thumb.addEventListener('pointerdown', onThumbDown)
    thumb.addEventListener('pointermove', onThumbMove)
    thumb.addEventListener('pointerup', onThumbUp)
    thumb.addEventListener('pointercancel', onThumbUp)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(fade)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', relayout)
      ro.disconnect()
      track.removeEventListener('pointerenter', onEnter)
      track.removeEventListener('pointerleave', onLeave)
      track.removeEventListener('pointerdown', onTrackDown)
      thumb.removeEventListener('pointerdown', onThumbDown)
      thumb.removeEventListener('pointermove', onThumbMove)
      thumb.removeEventListener('pointerup', onThumbUp)
      thumb.removeEventListener('pointercancel', onThumbUp)
    }
  }, [anchorRef])

  return (
    <div ref={trackRef} className="page-scrollbar" aria-hidden="true" style={{ display: 'none' }}>
      <div ref={thumbRef} className="page-scrollbar-thumb" />
    </div>
  )
}
