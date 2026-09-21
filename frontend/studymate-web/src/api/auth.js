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

/**
 * DELETE /auth/me - JSON { current_password } -> { message }
 *
 * Permanently deletes the signed-in account and everything attached to it.
 * There is no undo, no grace period and nothing to restore from, which is
 * why the password is re-entered: the token alone proves the browser, and an
 * unlocked laptop is a browser somebody else is holding.
 *
 * A BODY ON A DELETE, which is unusual enough to say out loud. axios sends
 * it through `data` rather than as the second argument, and FastAPI reads it
 * the same way it reads any other Pydantic body. The alternative was a POST
 * named /auth/delete-account, which would have hidden a deletion behind the
 * verb this API uses for creating things.
 *
 * The caller MUST forget the session afterwards. There is no account left,
 * so the token this call was made with is already dead - every later request
 * would 401 and be dragged through the refresh interceptor for nothing.
 */
export async function deleteAccount({ currentPassword }) {
  const { data } = await client.delete('/auth/me', {
    data: { current_password: currentPassword },
  })
  return data
}

/**
 * POST /auth/verify-email - JSON { email, code } -> TokenResponse.
 *
 * The call that ends registration. It answers with the same token pair
 * /auth/login answers with, so the student is signed in by the act of
 * proving the address is theirs and never meets a sign-in form in between.
 *
 * Plain axios rather than `client`, exactly like login() above: there is no
 * session yet, the call carries no Authorization header, and a 400 from it
 * must not be dragged through the 401 refresh interceptor.
 *
 * EVERY FAILURE IS THE SAME 400 with the same sentence - wrong code,
 * expired, already used, too many guesses, no such account. That is the
 * server being careful rather than being unhelpful, and the interface must
 * not try to guess which of them happened.
 */
export async function verifyEmail({ email, code }) {
  const { data } = await axios.post(`${API_BASE_URL}/auth/verify-email`, {
    email,
    code,
  })
  return data
}

/**
 * POST /auth/resend-verification - JSON { email } -> { message }
 *
 * ALWAYS ANSWERS 200, whether or not that address has an account. Nothing
 * in the response says which, and the interface must not pretend to know:
 * the confirmation it shows is "if that address needs verifying, a code is
 * on its way", never "we sent it".
 *
 * The one refusal is a 429 once too many codes have been asked for in an
 * hour, which lib/serverErrors.js translates.
 */
export async function resendVerification({ email }) {
  const { data } = await axios.post(`${API_BASE_URL}/auth/resend-verification`, {
    email,
  })
  return data
}
