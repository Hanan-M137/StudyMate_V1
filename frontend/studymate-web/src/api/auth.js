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
