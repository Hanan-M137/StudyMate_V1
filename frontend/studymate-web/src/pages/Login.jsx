import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import { Button, Field, Input, InlineError } from '../components/ui'
import AuthLayout from './AuthLayout'

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/documents" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      navigate(location.state?.from || '/documents', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, t, 'auth.couldNotSignIn'))
    } finally {
      setSubmitting(false)
    }
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
