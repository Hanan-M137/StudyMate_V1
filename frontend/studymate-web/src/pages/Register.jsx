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
import AuthLayout from './AuthLayout'

export default function Register() {
  const { register, login, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

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
      await register({ email, password, fullName })
      // Registration returns only a confirmation message, so sign in explicitly.
      await login({ email, password })
      navigate('/documents', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, t, 'auth.couldNotCreateAccount'))
    } finally {
      setSubmitting(false)
    }
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
