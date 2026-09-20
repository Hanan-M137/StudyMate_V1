import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import { Button, Field, Input, InlineError } from '../components/ui'
import VerifyEmailPanel from '../components/VerifyEmailPanel'
import AuthLayout from './AuthLayout'

/* ==========================================================================
   Sign in - and the one branch that is not a failure.

   A 403 here means the password was right and the address has never been
   verified. That is the one refusal this page can do something about, so it
   does: the same code field registration ends on, with the same Resend link
   beside it. Showing the sentence and stopping there would leave a student
   who closed the tab before entering their code with a correct password, a
   real account, and no way in.
   ========================================================================== */

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  /* Set by a 403 from /auth/login, and only by that. */
  const [needsVerification, setNeedsVerification] = useState(false)

  if (isAuthenticated) return <Navigate to="/documents" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(location.state?.from || '/documents', { replace: true })
    } catch (err) {
      /* Recognised by its status and not by its sentence. /auth/login has
         exactly one 403 and this is it, while matching on the text would
         put this branch at the mercy of a reworded detail= - the failure
         mode the note at the top of lib/serverErrors.js describes, except
         that here it would cost a student their way into the app rather
         than one English sentence on an Arabic page. */
      if (err?.response?.status === 403) {
        setNeedsVerification(true)
      }

      setError(getErrorMessage(err, t, 'auth.couldNotSignIn'))
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- The way out of an unverified account --------------------------- */

  if (needsVerification) {
    return (
      <AuthLayout
        title={t('auth.verifyTitle')}
        subtitle={t('auth.verifyFromSignInSubtitle')}
        footer={
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setNeedsVerification(false)
              setError(null)
            }}
          >
            {t('auth.backToSignIn')}
          </Button>
        }
      >
        {/* The server's own sentence, kept above the field so the student
            can see why they are being asked for a code rather than let in.
            It is a state of affairs and not a mistake they made, which is
            why it is not rendered as an error. */}
        <p role="status" className="type-small mb-4 text-muted">
          {error}
        </p>

        <VerifyEmailPanel
          email={email}
          onVerified={() =>
            navigate(location.state?.from || '/documents', { replace: true })
          }
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.welcomeBack')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <p className="type-small text-muted">
          {t('auth.noAccountYet')}{' '}
          <Link
            to="/register"
            className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t('auth.createOne')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

        <Field label={t('auth.password')} required>
          {(field) => (
            <Input
              {...field}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <InlineError message={error} />

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {t('auth.signIn')}
        </Button>
      </form>
    </AuthLayout>
  )
}
