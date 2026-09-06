/**
 * Token storage. Kept outside React so the axios interceptor can reach it.
 *
 * The backend rotates the refresh token on every /auth/refresh call, so BOTH
 * tokens must be replaced whenever a TokenResponse comes back.
 */

const ACCESS_KEY = 'studymate.access_token'
const REFRESH_KEY = 'studymate.refresh_token'

const listeners = new Set()

export function getAccessToken() {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

/** TokenResponse = { access_token, refresh_token, token_type } */
export function setTokens(tokenResponse) {
  if (!tokenResponse) return
  try {
    if (tokenResponse.access_token) {
      localStorage.setItem(ACCESS_KEY, tokenResponse.access_token)
    }
    if (tokenResponse.refresh_token) {
      localStorage.setItem(REFRESH_KEY, tokenResponse.refresh_token)
    }
  } catch {
    /* storage unavailable - the session simply will not survive a reload */
  }
  notify()
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* ignore */
  }
  notify()
}

export function isAuthenticated() {
  return Boolean(getAccessToken())
}

/** Lets AuthContext react to a forced logout triggered from the interceptor. */
export function subscribeToTokens(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* a bad listener must not break token handling */
    }
  }
}
