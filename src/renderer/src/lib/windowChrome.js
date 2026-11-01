import { caps } from '../platform'

// The Mac window has no title bar (titleBarStyle 'hidden', src/main/index.js):
// the traffic lights sit over the page. A transparent strip across the top keeps
// the window draggable — above every modal too, which a plain hidden title bar
// can't manage — and --chrome-top (28px, 0 in fullscreen) keeps the page's own
// controls out from under it. index.css does the rest.
export const CHROME_HEIGHT = 28

export function initWindowChrome() {
  if (!caps.windowChrome) return
  const root = document.documentElement
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
