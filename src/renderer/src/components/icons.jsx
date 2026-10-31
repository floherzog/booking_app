// The app's small line icons, all drawn alike: a 24×24 box, 2 px round
// strokes in the current text colour, so they sit together in one toolbar.
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export function FilterIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

export function SelectIcon({ on = false, className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      {on && <path d="M7.5 12.3l3 3 6-6.6" />}
    </svg>
  )
}

// An envelope: the body and its flap.
export function MailIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </svg>
  )
}
