import { useEffect, useRef, useState } from 'react'

const MS = 200

// One place in the banner stack at the top of the window. A banner slides down
// into it when `show` turns true and back up when it turns false — the slot
// keeps the last content on screen for that, and collapses its height so the
// banners below move up instead of jumping. index.css turns the motion off for
// "reduce motion".
export default function BannerSlot({ show, children }) {
  const [mounted, setMounted] = useState(show)
  const [open, setOpen] = useState(false)
  const last = useRef(children)
  if (show) last.current = children

  useEffect(() => {
    if (show) {
      setMounted(true)
      // A frame in the closed state first, so the opening transitions.
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
      return () => cancelAnimationFrame(f)
    }
    setOpen(false)
    const tx = setTimeout(() => setMounted(false), MS)
    return () => clearTimeout(tx)
  }, [show])

  if (!mounted) return null
  return (
    <div
      data-banner-slot={open ? 'open' : 'closed'}
      className={`banner-slot grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100 translate-y-0' : 'grid-rows-[0fr] opacity-0 -translate-y-2'}`}
    >
      <div className={`min-h-0 ${open ? '' : 'overflow-hidden'}`}>
        <div className="pb-2">{show ? children : last.current}</div>
      </div>
    </div>
  )
}
