import axios from 'axios'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokens'

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000'

/** Main instance: every app request goes through this one. */
const client = axios.create({
  baseURL: API_BASE_URL,
})

/**
 * Bare instance used only for POST /auth/refresh, so a failing refresh can
 * never re-enter the response interceptor and loop forever.
 */
const refreshClient = axios.create({ baseURL: API_BASE_URL })

client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ------------------------------------------------------------------ */
/* Single-flight refresh with a queue for concurrent 401s              */
/* ------------------------------------------------------------------ */

let isRefreshing = false
let waiters = []

function queueWaiter() {
  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject })
  })
}

function flushWaiters(error, token) {
  const pending = waiters
  waiters = []
  for (const waiter of pending) {
    if (error) waiter.reject(error)
    else waiter.resolve(token)
  }
}

/** Called when refreshing is impossible: drop tokens and bounce to /login. */
function forceLogout() {
  clearTokens()
  if (
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login' &&
    window.location.pathname !== '/register'
  ) {
    window.location.replace('/login')
  }
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (!error.response || error.response.status !== 401 || !original) {
      return Promise.reject(error)
    }

    // Never try to refresh a failed auth call itself.
    const url = original.url || ''
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return Promise.reject(error)
    }

    // Only ever retry a given request once.
    if (original._retriedAfterRefresh) {
      forceLogout()
      return Promise.reject(error)
    }
    original._retriedAfterRefresh = true

    // A refresh is already in flight: wait for it instead of starting another.
    if (isRefreshing) {
      try {
        const token = await queueWaiter()
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      } catch (queueError) {
        return Promise.reject(queueError)
      }
    }

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      forceLogout()
      return Promise.reject(error)
    }

    isRefreshing = true
    try {
      const { data } = await refreshClient.post('/auth/refresh', {
        refresh_token: refreshToken,
      })

      // The backend rotates the refresh token too - store BOTH.
      setTokens({
        access_token: data?.access_token,
        refresh_token: data?.refresh_token,
      })

      const newAccess = data?.access_token
      if (!newAccess) throw new Error('Refresh response had no access_token')

      flushWaiters(null, newAccess)

      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${newAccess}`
      return client(original)
    } catch (refreshError) {
      flushWaiters(refreshError, null)
      forceLogout()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default client
