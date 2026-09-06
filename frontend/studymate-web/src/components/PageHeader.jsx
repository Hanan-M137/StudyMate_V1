export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="type-eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="type-display">{title}</h1>
        {description ? (
          <p className="measure type-small mt-2 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  )
}
