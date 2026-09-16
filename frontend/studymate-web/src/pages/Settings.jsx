import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { changePassword, updateProfile } from '../api/auth'
import { setTokens } from '../api/tokens'
import { getErrorMessage } from '../lib/errors'
import { THEMES, getStoredTheme, setTheme, watchSystemTheme } from '../lib/theme'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  InlineError,
} from '../components/ui'

/* ==========================================================================
   Settings - appearance and account.

   Two sections and no more. Everything here either works completely or is
   not on the page: a control that does nothing is worse than no control,
   because it makes a promise the app cannot keep.
   ========================================================================== */

const THEME_LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

const THEME_HINTS = {
  system: 'Follow the setting on this device.',
  light: 'Always the light palette.',
  dark: 'Always the dark palette.',
}

export default function Settings() {
  return (
    <div className="no-print space-y-6">
      <header>
        <h1 className="type-display">Settings</h1>
        <p className="type-small mt-1 text-muted">Appearance and account.</p>
      </header>

      <AppearanceSection />
      <AccountSection />
    </div>
  )
}

/* ==========================================================================
   Appearance
   ========================================================================== */

function AppearanceSection() {
  /* Read once, from storage rather than from the document: the inline script
     in index.html has already resolved 'system' into a light or dark
     attribute, so reading the document back would turn a preference of
     "follow my machine" into a fixed choice the student never made. */
  const [theme, setThemeState] = useState(getStoredTheme)

  /* While the choice is 'system', the OS can change underneath the page - at
     sunset, or when someone flips it in another window - and the page has to
     follow. watchSystemTheme subscribes only in that case and returns the
     unsubscribe, so switching to an explicit choice tears the listener down. */
  useEffect(() => watchSystemTheme(theme), [theme])

  function choose(value) {
    setThemeState(setTheme(value))
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="type-title">Appearance</h2>
      </CardHeader>

      <CardBody>
        {/* A radio group, not a dropdown: three options, all worth seeing at
            once, and the choice takes effect on the spot - there is nothing
            to save, so there is no save button. */}
        <fieldset>
          <legend className="mb-2.5 block text-sm font-medium text-ink-soft">Theme</legend>

          <div className="space-y-2">
            {THEMES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3.5 py-3 transition-colors duration-150 hover:bg-sunken has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => choose(value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{THEME_LABELS[value]}</span>
                  <span className="type-small block text-muted">{THEME_HINTS[value]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  )
}

/* ==========================================================================
   Account
   ========================================================================== */

function AccountSection() {
  return (
    <Card>
      <CardHeader>
        <h2 className="type-title">Account</h2>
      </CardHeader>

      <CardBody className="space-y-7">
        <NameForm />
        <PasswordForm />
      </CardBody>
    </Card>
  )
}

/* ---- Name --------------------------------------------------------------- */

function NameForm() {
  const { fullName, email, applyProfile } = useAuth()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  /* null means "nothing typed yet", which is not the same as an empty field.
     The name arrives from GET /auth/me a moment after the page mounts, so
     until the student touches the input it simply shows whatever the context
     currently holds - no effect, and no empty field left behind by a
     response that landed after the first render. Once they type, their draft
     takes over and a late response cannot overwrite it. */
  const [draft, setDraft] = useState(null)

  const name = draft ?? (fullName || '')

  async function handleSubmit(event) {
    event.preventDefault()

    setError(null)
    setSaved(false)
    setSaving(true)

    try {
      const user = await updateProfile({ fullName: name })

      /* Straight into the context, so the sidebar changes in the same moment
         rather than on the next page load. The server's copy is used, not
         the typed one: it has been trimmed. */
      applyProfile(user)

      // Back to following the context, which now holds what was just saved.
      setDraft(null)
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save your name.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <Field
        label="Name"
        hint={email ? `Signed in as ${email}.` : undefined}
      >
        {(field) => (
          <Input
            {...field}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setSaved(false)
              setDraft(event.target.value)
            }}
          />
        )}
      </Field>

      <InlineError message={error} />
      <SuccessNote message={saved ? 'Name saved.' : null} />

      <Button type="submit" loading={saving} disabled={!name.trim()}>
        Save name
      </Button>
    </form>
  )
}

/* ---- Password ----------------------------------------------------------- */

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setError(null)
    setSaved(false)

    /* Caught here rather than sent: the server has no way to tell a typo in
       the confirmation from a wrong new password, so it would answer a
       question nobody meant to ask. */
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.')
      return
    }

    setSaving(true)

    try {
      const tokens = await changePassword({ currentPassword, newPassword })

      /* Changing the password revokes every token the account holds,
         including the one this browser just used. These are the replacement
         pair, so storing them is what keeps the student signed in here while
         every other session ends. */
      setTokens(tokens)

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change your password.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-line pt-6" noValidate>
      <p className="text-sm font-medium text-ink">Change password</p>

      <Field label="Current password" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setSaved(false)
              setCurrentPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <Field label="New password" required hint="Use at least 8 characters.">
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => {
              setSaved(false)
              setNewPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <Field label="Confirm new password" required>
        {(field) => (
          <Input
            {...field}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setSaved(false)
              setConfirmPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <InlineError message={error} />
      <SuccessNote
        message={
          saved
            ? 'Password changed. Any other device signed in to this account has been signed out.'
            : null
        }
      />

      <Button
        type="submit"
        loading={saving}
        disabled={!currentPassword || !newPassword || !confirmPassword}
      >
        Change password
      </Button>
    </form>
  )
}

/* ==========================================================================
   The counterpart to InlineError
   ========================================================================== */

/* Deliberately the same shape and weight as InlineError, in the accent
   rather than the danger tone. Confirmation belongs on the page next to the
   thing that was saved - an alert() would say it in a box the student has to
   dismiss before they can see whether it is true. */
function SuccessNote({ message }) {
  if (!message) return null

  return (
    <p role="status" className="type-small text-accent">
      {message}
    </p>
  )
}
