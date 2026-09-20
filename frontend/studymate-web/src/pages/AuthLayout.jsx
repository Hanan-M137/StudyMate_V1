import { Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import IntroVideo from '../components/IntroVideo'

/** Two-panel sign-in shell: quiet editorial panel on the left, form on the right. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  const { t } = useI18n()

  return (
    /* Two rows on a wide screen rather than one, so the intro video has a
       place in the left column underneath the pitch panel - beside the form
       rather than above or below it. The form spans both rows and stays
       centred over the whole height, exactly as it did when there was one
       row. Below lg none of this applies: the grid is off, the aside is
       hidden, and the three children are in plain document order, which is
       what puts the video after the form on a phone. */
    <div className="min-h-screen lg:grid lg:grid-cols-2 lg:grid-rows-[1fr_auto]">
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

        <div className="measure translate-y-2">
          <p className="font-display text-3xl leading-tight">{t('auth.pitchTitle')}</p>
          <p className="mt-4 text-sm leading-relaxed text-on-accent/80">{t('auth.pitchBody')}</p>
        </div>

        <p className="type-micro translate-y-2 text-on-accent/60">
          {t('auth.pitchFooter')}
        </p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-8 lg:row-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h1 className="type-display">{title}</h1>
            {subtitle ? <p className="type-small mt-2 text-muted">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="mt-7 text-center">{footer}</div> : null}
        </div>
      </main>

      {/* Third child, so grid auto-placement drops it into the second row of
          the first column - under the accent panel, which it continues with
          the same background so the left column reads as one surface.

          On a phone it is simply the last thing on the page. <main> is a
          full screen tall, so the form is what a student arriving at
          /login sees, and the video is below it: someone who came here to
          sign in is never asked to scroll past an introduction to do it. */}
      <div className="px-4 pb-12 sm:px-8 lg:bg-accent lg:px-10">
        <IntroVideo />
      </div>
    </div>
  )
}
