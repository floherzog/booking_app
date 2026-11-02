import { caps } from '../platform'

// The Mac window has no title bar (titleBarStyle 'hidden', src/main/index.js):
// the traffic lights sit over the page. A transparent strip across the top keeps
// the window draggable — above every modal too, which a plain hidden title bar
// can't manage — and --chrome-top (28px, 0 in fullscreen) keeps the page's own
// controls out from under it. index.css does the rest.
//
// There the window's top part stays put and only the list scrolls, inside
// #list-scroller (components/ListScroller.jsx), so the scrollbar starts at the
// list; before the list exists (first run) #root, which starts below the
// strip, scrolls instead (html.mac-window). Anything that scrolls the page or
// listens to it goes through scroller()/onScroll()/scrollY()/scrollToY().
export const CHROME_HEIGHT = 28

export function initWindowChrome() {
  if (!caps.windowChrome) return
  const root = document.documentElement
  root.classList.add('mac-window')
  const page = document.getElementById('root')
  if (page) {
    page.tabIndex = -1 // so Page Up/Down and space scroll it
    page.style.outline = 'none'
    requestAnimationFrame(() => { if (document.activeElement === document.body) page.focus({ preventScroll: true }) })
  }
  const strip = document.createElement('div')
  strip.className = 'window-drag-strip'
  strip.setAttribute('aria-hidden', 'true')
  document.body.prepend(strip)
  // In fullscreen there are no traffic lights, and nothing to drag.
  const update = () => root.classList.toggle('window-chrome', window.innerHeight < window.screen.height)
  update()
  window.addEventListener('resize', update)
}

// The strip's height right now, in px (0 on the web and in fullscreen).
export const chromeTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-top')) || 0

// What the page scrolls in: the list scroller (or #root) in the Mac window,
// the window on the web.
export function scroller() {
  if (!caps.windowChrome) return window
  return document.getElementById('list-scroller') || document.getElementById('root') || window
}
// Where, in the window, something sticking to the top of the scroller sits:
// the scroller's own top on the Mac, below the drag strip and the sliding
// toolbar (--pin-top) on the web.
export function stickyTop() {
  const el = scroller()
  if (el !== window) return el.getBoundingClientRect().top
  return chromeTop() + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pin-top')) || 0)
}
export const scrollY = () => { const el = scroller(); return el === window ? window.scrollY : el.scrollTop }
export const scrollToY = (top, behavior = 'auto') => scroller().scrollTo({ top, behavior })
export const scrollByY = dy => scroller().scrollBy(0, dy)
// → unsubscribe
export function onScroll(fn) {
  const el = scroller()
  el.addEventListener('scroll', fn, { passive: true })
  return () => el.removeEventListener('scroll', fn)
}
