import { SpinnerIcon } from './icons'

// Every "something is loading" in the app looks the same: the spinner from
// the venue emails, with what is happening beside it. Without a label it is
// just the spinner (an icon button that is busy).
export default function Busy({ label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} role="status">
      <SpinnerIcon className="w-[1em] h-[1em] shrink-0" />
      {label}
    </span>
  )
}
