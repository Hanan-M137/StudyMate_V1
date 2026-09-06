import { cx } from './cx'
import Spinner from './Spinner'

const VARIANTS = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover shadow-card disabled:hover:bg-accent',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-sunken disabled:hover:bg-surface',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger-hover shadow-card disabled:hover:bg-danger',
  quiet: 'text-accent hover:text-accent-hover underline underline-offset-4 decoration-accent-line',
}

const SIZES = {
  sm: 'h-8 px-3 text-[0.8125rem] rounded-xs gap-1.5',
  md: 'h-10 px-4 text-sm rounded-sm gap-2',
  lg: 'h-11 px-5 text-sm rounded-sm gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className,
      )}
      {...props}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  )
}
