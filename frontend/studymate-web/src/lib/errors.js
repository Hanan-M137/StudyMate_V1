/**
 * Turns anything axios throws into a string we can show a human.
 *
 * FastAPI validation errors (422) look like:
 *   { "detail": [ { "loc": [...], "msg": "...", "type": "..." }, ... ] }
 * Other HTTP errors usually look like:
 *   { "detail": "Some message" }
 */
export function getErrorMessage(error, fallback = 'Something went wrong.') {
  if (!error) return fallback

  if (error.response) {
    const { status, data } = error.response
    const detail = data?.detail

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          const msg = item?.msg
          if (!msg) return null
          const field = fieldNameFromLoc(item?.loc)
          return field ? `${field}: ${msg}` : msg
        })
        .filter(Boolean)
      if (messages.length) return messages.join('\n')
    }

    if (typeof detail === 'string' && detail.trim()) return detail
    if (typeof data === 'string' && data.trim()) return data
    if (data?.message) return String(data.message)

    if (status === 401) return 'Your session has expired. Please sign in again.'
    if (status === 403) return 'You do not have access to this resource.'
    if (status === 404) return 'Not found.'
    return `Request failed (HTTP ${status}).`
  }

  if (error.request) {
    return 'Could not reach the API. Is the backend running?'
  }

  return error.message || fallback
}

/** ["body", "email"] -> "email"; drops the leading body/query/path segment. */
function fieldNameFromLoc(loc) {
  if (!Array.isArray(loc) || loc.length === 0) return null
  const parts = loc.filter(
    (part) => !['body', 'query', 'path', 'header', 'cookie'].includes(part),
  )
  if (parts.length === 0) return null
  return parts.join('.')
}
