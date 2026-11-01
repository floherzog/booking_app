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

// One function per icon; `className` sizes it (w-[1em] h-[1em] follows the text).
const icon = (name, body) => {
  const Icon = ({ className = 'w-4 h-4' }) => <svg {...base} className={className}>{body}</svg>
  Icon.displayName = name
  return Icon
}

// Three sliders — Settings, on every screen size.
export const SettingsIcon = icon('SettingsIcon', <>
  <path d="M4 7h7M15 7h5M4 12h2M10 12h10M4 17h11M19 17h1" />
  <circle cx="13" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="17" cy="17" r="2" />
</>)
export const GlobeIcon = icon('GlobeIcon', <>
  <circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19" />
  <path d="M12 2.5a14.5 14.5 0 0 1 3.8 9.5 14.5 14.5 0 0 1-3.8 9.5 14.5 14.5 0 0 1-3.8-9.5A14.5 14.5 0 0 1 12 2.5z" />
</>)
export const ListIcon = icon('ListIcon', <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />)
export const InfoIcon = icon('InfoIcon', <><circle cx="12" cy="12" r="9.5" /><path d="M12 16.5v-5M12 7.5h.01" /></>)
export const RefreshIcon = icon('RefreshIcon', <><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M20.5 3.5V8H16" /></>)
// A real answer: the arrow of "reply".
export const ReplyIcon = icon('ReplyIcon', <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>)
// An automatic answer: a clock.
export const AutoReplyIcon = icon('AutoReplyIcon', <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
export const UndoIcon = icon('UndoIcon', <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>)
export const MoreIcon = icon('MoreIcon', <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />)
export const WarningIcon = icon('WarningIcon', <><path d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>)
export const ExternalIcon = icon('ExternalIcon', <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>)
export const CheckIcon = icon('CheckIcon', <path d="M5 12.5l4.5 4.5L19 7.5" />)
export const XIcon = icon('XIcon', <path d="M6 6l12 12M18 6L6 18" />)
// Turns while something loads; index.css stops it for "reduce motion".
export function SpinnerIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`spinner animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
export const PencilIcon = icon('PencilIcon', <><path d="M15.5 4.5l4 4L8 20H4v-4z" /><path d="M13 7l4 4" /></>)
// Template editor toolbar.
export const BoldIcon = icon('BoldIcon', <path d="M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7zM7 12h7a3.75 3.75 0 0 1 0 7.5H7z" />)
export const ItalicIcon = icon('ItalicIcon', <path d="M10 4.5h8M6 19.5h8M14.5 4.5l-5 15" />)
export const UnderlineIcon = icon('UnderlineIcon', <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20.5h14" />)
export const LinkIcon = icon('LinkIcon', <><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>)
export const ImageIcon = icon('ImageIcon', <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="M21 16l-5-5-8.5 9" /></>)
export const VideoIcon = icon('VideoIcon', <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M10 9.2v5.6l4.8-2.8z" /></>)
