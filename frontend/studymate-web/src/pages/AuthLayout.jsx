import { Link } from 'react-router-dom'

/** Two-panel sign-in shell: quiet editorial panel on the left, form on the right. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-accent px-10 py-12 text-on-accent lg:flex">
        <Link to="/login" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-on-accent/15">
            <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
              <path
                d="M4 5.2A1.2 1.2 0 0 1 5.2 4H10v12H5.2A1.2 1.2 0 0 1 4 14.8z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M16 5.2A1.2 1.2 0 0 0 14.8 4H10v12h4.8a1.2 1.2 0 0 0 1.2-1.2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-display text-lg font-semibold">StudyMate</span>
        </Link>

        <div className="measure">
          <p className="font-display text-3xl leading-tight">
            Upload your course PDFs, then ask them questions.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-on-accent/80">
            Every answer is grounded in your own material and cites the page it came from. Turn any
            document into a quiz when it is time to revise.
          </p>
        </div>

        <p className="type-micro text-on-accent/60">AI study assistant for university students</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h1 className="type-display">{title}</h1>
            {subtitle ? <p className="type-small mt-2 text-muted">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="mt-7 text-center">{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}
