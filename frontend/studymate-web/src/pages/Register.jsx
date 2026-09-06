import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../lib/errors'
import { Button, Field, Input, InlineError } from '../components/ui'
import AuthLayout from './AuthLayout'

export default function Register() {
  const { register, login, isAuthenticated } = useAuth()
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
    setSubmitting(true)
    try {
      await register({ email, password, fullName })
      // Registration returns only a confirmation message, so sign in explicitly.
      await login({ email, password })
      navigate('/documents', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create the account.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register, then upload your first PDF."
      footer={
        <p className="type-small text-muted">
          Already registered?{' '}
          <Link
            to="/login"
            className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Full name" required>
          {(field) => (
            <Input
              {...field}
              autoComplete="name"
              placeholder="Hanan Mohammad"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
        </Field>

        <Field label="Email" required>
          {(field) => (
            <Input
              {...field}
              type="email"
              autoComplete="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field label="Password" required hint="Use at least 8 characters.">
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
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
