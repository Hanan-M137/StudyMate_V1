import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import BackToTop from './BackToTop'
import { Button, cx } from './ui'
import {
  ChatIcon,
  CloseIcon,
  DocumentIcon,
  LogoutIcon,
  MailIcon,
  MenuIcon,
  QuizIcon,
  SettingsIcon,
} from './icons'

/* Keys, not words. The list has to be built before any component runs and a
   hook cannot run out here, so each entry carries the key and NavLinks below
   resolves it while it renders. */
const NAV = [
  { to: '/documents', labelKey: 'nav.documents', icon: DocumentIcon },
  { to: '/conversations', labelKey: 'nav.conversations', icon: ChatIcon },
  { to: '/quizzes', labelKey: 'nav.quizzes', icon: QuizIcon },
]

export default function AppShell() {
  const { displayName, email, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Any navigation closes the mobile drawer.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handleSettings() {
    navigate('/settings')
  }

  function handleContact() {
    navigate('/contact')
  }

  return (
    /* `app-shell` is a print hook, not a style: the two-column grid has to
       collapse once the sidebar is hidden, or the content prints inside the
       16rem track the sidebar left behind. See @media print in index.css. */
    <div className="app-shell min-h-full lg:grid lg:grid-cols-[var(--sidebar-width)_1fr]">
      <a
        href="#main"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop"
      >
        {t('nav.skipToContent')}
      </a>

      {/* Mobile bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav"
          className="rounded-xs p-1.5 text-ink-soft transition-colors hover:bg-sunken"
        >
          {mobileNavOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          <span className="sr-only">{mobileNavOpen ? t('nav.closeMenu') : t('nav.openMenu')}</span>
        </button>
        <Wordmark />
      </header>

      {mobileNavOpen ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/35"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="mobile-nav"
            aria-label={t('nav.mainNavigation')}
            className="animate-enter absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col border-e border-line bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <Wordmark />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xs p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                <CloseIcon className="h-5 w-5" />
                <span className="sr-only">{t('nav.closeMenu')}</span>
              </button>
            </div>
            <NavLinks />
            <UserPanel
              displayName={displayName}
              email={email}
              onSettings={handleSettings}
              onContact={handleContact}
              onLogout={handleLogout}
            />
          </nav>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-e border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Wordmark />
        </div>
        <NavLinks />
        <UserPanel
          displayName={displayName}
          email={email}
          onSettings={handleSettings}
          onContact={handleContact}
          onLogout={handleLogout}
        />
      </aside>

      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Mounted once here rather than per page: every route inside the shell
          can grow long enough to need it, and the window is what scrolls for
          all of them. */}
      <BackToTop />
    </div>
  )
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent text-on-accent">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
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
      <span className="font-display text-[1.0625rem] font-semibold tracking-tight text-ink">
        StudyMate
      </span>
    </span>
  )
}

function NavLinks() {
  const { t } = useI18n()

  return (
    <nav aria-label={t('nav.mainNavigation')} className="flex-1 space-y-1 px-3 py-2 lg:px-3">
      {NAV.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors duration-150',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-ink-soft hover:bg-sunken hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cx('h-[18px] w-[18px]', isActive ? 'text-accent' : 'text-faint')} />
              {t(labelKey)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserPanel({ displayName, email, onSettings, onContact, onLogout }) {
  const { t } = useI18n()

  const label = displayName || email || t('nav.signedIn')
  const initials = (displayName || email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <div className="border-t border-line px-3 py-3">
      <div className="flex items-center gap-3 rounded-sm px-2 py-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[0.6875rem] font-semibold text-ink-soft"
        >
          {initials || '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{label}</span>
          {/* The second line is the email, and it is only worth a line when it
              is not already the first one. Comparing against displayName
              rather than checking that a name exists means the row never
              shows the same address twice, whatever the reason the name is
              missing. */}
          {label !== email && email ? (
            <span className="type-micro block truncate text-faint">{email}</span>
          ) : null}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="no-print mt-1 w-full justify-start"
        onClick={onSettings}
      >
        <SettingsIcon className="h-4 w-4" />
        {t('nav.settings')}
      </Button>

      {/* Beside Settings and styled the same, because it is the same kind of
          entry: a place in the app that is about the account rather than
          about a document. `no-print` for the same reason the Settings
          button carries it - a printed page is a quiz or a conversation,
          and a link nobody can click has no business on it. */}
      <Button
        variant="ghost"
        size="sm"
        className="no-print mt-1 w-full justify-start"
        onClick={onContact}
      >
        <MailIcon className="h-4 w-4" />
        {t('nav.contact')}
      </Button>

      <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={onLogout}>
        {/* The only icon in the sidebar that points anywhere: it shows
            something leaving, and in a right-to-left layout things leave to
            the left. The document, chat, quiz and gear icons beside it mean
            no direction at all and are left alone. */}
        <LogoutIcon className="h-4 w-4 rtl:-scale-x-100" />
        {t('auth.signOut')}
      </Button>
    </div>
  )
}
