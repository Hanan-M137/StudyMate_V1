import axios from 'axios'
import client, { API_BASE_URL } from './client'

/**
 * POST /auth/login
 * Body is application/x-www-form-urlencoded (OAuth2 password flow), NOT JSON,
 * and the user's email goes in the `username` field.
 * Returns TokenResponse { access_token, refresh_token, token_type }.
 */
export async function login({ email, password }) {
  const body = new URLSearchParams()
  body.append('grant_type', 'password')
  body.append('username', email)
  body.append('password', password)

  // Plain axios: the login call carries no Authorization header and must not
  // be caught by the 401 refresh interceptor.
  const { data } = await axios.post(`${API_BASE_URL}/auth/login`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

/** POST /auth/register - JSON { email, password, full_name }. */
export async function register({ email, password, fullName }) {
  const { data } = await axios.post(`${API_BASE_URL}/auth/register`, {
    email,
    password,
    full_name: fullName,
  })
  return data
}

/** POST /auth/refresh - JSON { refresh_token } -> TokenResponse. */
export async function refresh(refreshToken) {
  const { data } = await client.post('/auth/refresh', {
    refresh_token: refreshToken,
  })
  return data
}

/**
 * POST /auth/logout - revokes every token this account holds.
 *
 * Uses `client`, so it carries the access token: the server needs to know
 * whose tokens to revoke. That also means it fails when the session has
 * already expired, which is why the caller clears the stored tokens whether
 * this succeeds or not - signing out locally must never depend on the
 * network.
 *
 * Revocation is account-wide, not per device: it signs out the phone as
 * well as the laptop.
 */
export async function logout() {
  await client.post('/auth/logout')
}

/**
 * GET /auth/me -> { id, email, full_name }
 *
 * Uses `client`, so a 401 goes through the same refresh-then-force-logout
 * path every other call uses. That is deliberate: asking who the session
 * belongs to is exactly as much a session-expiry check as any other request,
 * and it must not grow a second way of handling one.
 */
export async function getMe() {
  const { data } = await client.get('/auth/me')
  return {
    id: data?.id != null ? String(data.id) : null,
    email: data?.email ?? null,
    fullName: data?.full_name ?? null,
  }
}

/** PATCH /auth/me - JSON { full_name } -> the same shape as getMe(). */
export async function updateProfile({ fullName }) {
  const { data } = await client.patch('/auth/me', { full_name: fullName })
  return {
    id: data?.id != null ? String(data.id) : null,
    email: data?.email ?? null,
    fullName: data?.full_name ?? null,
  }
}

/**
 * POST /auth/change-password - JSON { current_password, new_password }
 *   -> TokenResponse { access_token, refresh_token, token_type }
 *
 * A successful change revokes every token the account holds, including the
 * one that made this call. The pair returned here is the replacement, so the
 * caller MUST store it - otherwise the change signs the student out of the
 * browser they just changed it in.
 */
export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await client.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return data
}
