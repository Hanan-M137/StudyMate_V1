import { useId } from 'react'
import { cx } from './cx'

const CONTROL =
  'w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-faint transition-colors duration-150 ' +
  'hover:border-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted'

export function Label({ className, children, ...props }) {
  return (
    <label className={cx('mb-1.5 block text-sm font-medium text-ink-soft', className)} {...props}>
      {children}
    </label>
  )
}

/**
 * Label + control + hint/error, wired together with ids so screen readers and
 * click-to-focus both work. Children receive the generated id via a render prop.
 */
export function Field({ label, hint, error, required = false, children, className }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </Label>
      ) : null}

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}

      {hint && !error ? (
        <p id={hintId} className="type-small mt-1.5 text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="type-small mt-1.5 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }) {
  return <input className={cx(CONTROL, className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cx(CONTROL, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function Textarea({ className, ...props }) {
  return <textarea className={cx(CONTROL, 'min-h-24 resize-y', className)} {...props} />
}
