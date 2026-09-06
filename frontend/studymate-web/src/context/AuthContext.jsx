import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '../api/auth'
import {
  clearTokens,
  getAccessToken,
  setTokens,
  subscribeToTokens,
} from '../api/tokens'

const AuthContext = createContext(null)

/**
 * The spec's TokenResponse carries no user object and there is no /users/me
 * endpoint, so the only thing we can know about the session is whether an
 * access token exists. We keep the email typed at login purely for display.
 */
const EMAIL_KEY = 'studymate.email'
const NAME_KEY = 'studymate.full_name'

function readStored(key) {
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

function writeStored(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable - display name simply will not persist */
  }
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()))
  const [email, setEmail] = useState(() => readStored(EMAIL_KEY))
  // full_name is only known at registration time - there is no /users/me
  // endpoint and TokenResponse carries no user object.
  const [fullName, setFullName] = useState(() => readStored(NAME_KEY))

  // The axios interceptor can clear tokens on a failed refresh; mirror that here.
  useEffect(
    () =>
      subscribeToTokens(() => {
        setIsAuthenticated(Boolean(getAccessToken()))
      }),
    [],
  )

  const login = useCallback(async (credentials) => {
    const tokens = await authApi.login(credentials)
    setTokens(tokens)
    writeStored(EMAIL_KEY, credentials.email)
    setEmail(credentials.email)
    setIsAuthenticated(true)
    return tokens
  }, [])

  const register = useCallback(async (payload) => {
    const result = await authApi.register(payload)
    writeStored(NAME_KEY, payload.fullName)
    setFullName(payload.fullName || null)
    return result
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    writeStored(EMAIL_KEY, null)
    writeStored(NAME_KEY, null)
    setEmail(null)
    setFullName(null)
    setIsAuthenticated(false)
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated,
      email,
      fullName,
      displayName: fullName || email,
      login,
      register,
      logout,
    }),
    [isAuthenticated, email, fullName, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
