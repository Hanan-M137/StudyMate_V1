import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT_KEY,
  getPasswordErrorKey,
} from '../lib/password'
import { Button, Field, Input, InlineError } from '../components/ui'
import VerifyEmailPanel from '../components/VerifyEmailPanel'
import AuthLayout from './AuthLayout'

/* ==========================================================================
   Create an account - and, when the server asks for one, enter the code.

   THE VERIFICATION STEP IS A STATE HERE, NOT A ROUTE. It has no address of
   its own on purpose: the only thing that makes the step meaningful is the
   address that was just registered, and a route would have to carry that in
   the URL or in router state. A URL would put a student's email in their
   history and in every link they pasted; router state is lost by a reload,
   which would leave /verify-email reachable, empty, and with nothing to do -
   a dead end at the worst moment, one step from a finished account.

   As a state it cannot be reached wrongly, the email is simply in hand, and
   a student who reloads lands back on the registration form and signs in
   from there - which works, because the account already exists.
   ========================================================================== */

export default function Register() {
  const { register, login, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  /* Set only when the server answered registration with a code instead of
     an account ready to use. While email verification is off it never
     becomes true and this page behaves exactly as it did before. */
  const [awaitingCode, setAwaitingCode] = useState(false)

  if (isAuthenticated) return <Navigate to="/documents" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    /* The same three rules the API applies, checked here first so the
       ordinary mistake never costs a round trip. The server still checks:
       this is a convenience, not the rule. */
    const passwordErrorKey = getPasswordErrorKey(password)
    if (passwordErrorKey) {
      setError(t(passwordErrorKey, { min: MIN_PASSWORD_LENGTH }))
      return
    }

    setSubmitting(true)
    try {
      const result = await register({ email, password, fullName })

      /* The server tells us which of its two endings happened by what it
         sends back. With verification on it answers 201 and echoes the
         address the code went to; with it off it answers the message and id
         it has always answered, and there is no code to wait for. The shape
         of the response decides, so the browser never has to be told
         separately which way the switch in .env is set. */
      if (result?.email) {
        setAwaitingCode(true)
        return
      }

      // Registration returns only a confirmation message, so sign in explicitly.
      await login({ email, password })
      navigate('/documents', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, t, 'auth.couldNotCreateAccount'))
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- The code step ------------------------------------------------- */

  /* Lands where registration has always landed. Verifying returns the same
     token pair a sign-in does, so there is nothing else left to do. */
  if (awaitingCode) {
    return (
      <AuthLayout
        title={t('auth.verifyTitle')}
        subtitle={t('auth.verifySubtitle')}
        footer={
          <p className="type-small text-muted">
            {t('auth.alreadyRegistered')}{' '}
            <Link
              to="/login"
              className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              {t('auth.signInLink')}
            </Link>
          </p>
        }
      >
        <VerifyEmailPanel
          email={email}
          onVerified={() => navigate('/documents', { replace: true })}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.createAccountTitle')}
      subtitle={t('auth.createAccountSubtitle')}
      footer={
        <p className="type-small text-muted">
          {t('auth.alreadyRegistered')}{' '}
          <Link
            to="/login"
            className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t('auth.signInLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label={t('auth.fullName')} required>
          {(field) => (
            <Input
              {...field}
              autoComplete="name"
              placeholder={t('auth.fullNamePlaceholder')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
        </Field>

        <Field label={t('auth.email')} required>
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field
          label={t('auth.password')}
          required
          hint={t(PASSWORD_HINT_KEY, { min: MIN_PASSWORD_LENGTH })}
        >
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <InlineError message={error} />

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {t('auth.createAccount')}
        </Button>
      </form>
    </AuthLayout>
  )
}
