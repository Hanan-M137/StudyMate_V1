import { cx } from './cx'

export default function Card({ as: Tag = 'div', className, interactive = false, ...props }) {
  return (
    <Tag
      className={cx(
        'rounded-lg border border-line bg-surface shadow-card',
        interactive &&
          'transition-colors duration-150 hover:border-line-strong hover:bg-surface',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cx('border-b border-line px-5 py-4', className)} {...props} />
}

export function CardBody({ className, ...props }) {
  return <div className={cx('px-5 py-4', className)} {...props} />
}

export function CardFooter({ className, ...props }) {
  return (
    <div className={cx('border-t border-line bg-sunken/60 px-5 py-3.5', className)} {...props} />
  )
}
