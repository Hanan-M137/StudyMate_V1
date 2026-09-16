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
 * The email is still mirrored into local storage, but only so the sidebar has
 * something to show in the moment between the page booting and GET /auth/me
 * answering. The server is the source of truth for both the email and the
 * name; the copy here is a placeholder, not a record.
 *
 * The name is no longer stored at all. It used to be written down once at
 * registration, which meant the first sign-out lost it for good and the
 * sidebar fell back to showing the email twice - the bug this replaces.
 */
const EMAIL_KEY = 'studymate.email'

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
    /* storage unavailable - the placeholder email simply will not persist */
  }
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()))
  const [email, setEmail] = useState(() => readStored(EMAIL_KEY))
  const [fullName, setFullName] = useState(null)

  // The axios interceptor can clear tokens on a failed refresh; mirror that here.
  useEffect(
    () =>
      subscribeToTokens(() => {
        setIsAuthenticated(Boolean(getAccessToken()))
      }),
    [],
  )

  /* Ask the server who this session belongs to.

     Nothing is caught here on purpose. getMe() goes through `client`, so a
     401 has already been through the refresh attempt and, if that failed,
     through forceLogout() - which clears the tokens and sends the browser to
     /login. subscribeToTokens above then flips isAuthenticated. That is the
     session-expiry path every other request in the app uses, and adding a
     second one here would only give expiry two behaviours to disagree over. */

  const loadUser = useCallback(async () => {
    const user = await authApi.getMe()

    setEmail(user.email)
    setFullName(user.fullName)
    writeStored(EMAIL_KEY, user.email)

    return user
  }, [])

  /* On boot, not on every render: a token in storage is a session to be
     confirmed, and the name has to come from somewhere now that it is not
     written down. A rejected token needs no handling here for the reason
     given above. */
  useEffect(() => {
    if (!getAccessToken()) return

    loadUser().catch(() => {
      /* Handled by the interceptor. */
    })
  }, [loadUser])

  const login = useCallback(
    async (credentials) => {
      const tokens = await authApi.login(credentials)
      setTokens(tokens)

      // Shown immediately, so the sidebar is not blank while /auth/me is in
      // flight; loadUser replaces it with the server's own copy.
      writeStored(EMAIL_KEY, credentials.email)
      setEmail(credentials.email)
      setIsAuthenticated(true)

      await loadUser().catch(() => {
        /* Signing in succeeded. A failure to read the profile leaves the
           email on screen rather than undoing a good login. */
      })

      return tokens
    },
    [loadUser],
  )

  /* Registering does not sign anyone in - it returns a confirmation message
     and no tokens, and Register.jsx calls login() straight afterwards, which
     is what actually fills the name in. The guarded call is here for the case
     where an account is created from an already-signed-in session. */
  const register = useCallback(
    async (payload) => {
      const result = await authApi.register(payload)

      if (getAccessToken()) {
        await loadUser().catch(() => {})
      }

      return result
    },
    [loadUser],
  )

  /* Sign-out revokes on the server as well as clearing this device.
     /auth/logout raises the account's token_version, and every token carries
     the version it was issued with, so every access and refresh token this
     account holds stops being accepted at once - verified by hand: the same
     token listed the documents, then returned 401 after this call.

     The revocation is account-wide, so it signs out the phone along with the
     laptop. Per-device revocation would need an id stored per token.

     The call comes first, because clearing the tokens would leave nothing to
     authenticate it with - and the clearing happens in `finally`, because a
     failed request (an expired session, the server down) must never trap
     someone inside the app. */

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* Already expired, or the server is unreachable. Either way the local
         sign-out below still happens. */
    } finally {
      clearTokens()
      writeStored(EMAIL_KEY, null)
      setEmail(null)
      setFullName(null)
      setIsAuthenticated(false)
    }
  }, [])

  /* Used by the settings page after PATCH /auth/me, so the sidebar changes in
     the same moment the save succeeds rather than on the next page load. */
  const applyProfile = useCallback((user) => {
    if (!user) return

    if (user.email !== undefined) {
      setEmail(user.email)
      writeStored(EMAIL_KEY, user.email)
    }

    if (user.fullName !== undefined) setFullName(user.fullName)
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
      applyProfile,
    }),
    [isAuthenticated, email, fullName, login, register, logout, applyProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
