import Button from './Button'
import Card from './Card'
import Spinner from './Spinner'
import { cx } from './cx'

/** Skeleton shimmer used by the designed loading states. */
export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-xs bg-sunken', className)} aria-hidden="true" />
}

/** Loading placeholder that mirrors the shape of the content it replaces. */
export function LoadingState({ label = 'Loading', rows = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="type-small flex items-center gap-2 text-muted">
        <Spinner className="h-3.5 w-3.5" />
        <span>{label}</span>
      </p>
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-2.5 h-3 w-1/2" />
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div
      className={cx(
        'rounded-lg border border-dashed border-line-strong bg-surface/70 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-muted">
          {icon}
        </div>
      ) : null}
      <p className="type-title text-ink">{title}</p>
      {description ? (
        <div className="measure type-small mx-auto mt-2 text-muted">{description}</div>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/** Multi-line safe: 422 details arrive joined with newlines. */
export function ErrorState({ message, onRetry, title = 'Something went wrong' }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3.5"
    >
      <div className="flex gap-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-danger"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 6v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-danger">{title}</p>
          <p className="type-small mt-1 whitespace-pre-line text-danger/90">{message}</p>
          {onRetry ? (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Compact inline error for forms, where the alert block would dominate. */
export function InlineError({ message }) {
  if (!message) return null
  return (
    <p role="alert" className="type-small whitespace-pre-line text-danger">
      {message}
    </p>
  )
}
