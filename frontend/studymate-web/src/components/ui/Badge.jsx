import { cx } from './cx'

const TONES = {
  neutral: 'bg-sunken text-ink-soft border-line',
  accent: 'bg-accent-soft text-accent border-accent-line',
  pending: 'bg-pending-soft text-pending border-pending-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
}

export default function Badge({ tone = 'neutral', dot = false, className, children, ...props }) {
  return (
    <span
      className={cx(
        'type-micro inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold',
        TONES[tone] || TONES.neutral,
        className,
      )}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
