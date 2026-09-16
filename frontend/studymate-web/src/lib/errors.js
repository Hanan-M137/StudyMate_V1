/* ==========================================================================
   Turns anything axios throws into a sentence we can show a human.

   FastAPI validation errors (422) look like:
     { "detail": [ { "loc": [...], "msg": "...", "type": "..." }, ... ] }
   Other HTTP errors usually look like:
     { "detail": "Some message" }

   WHAT CHANGED FOR ARABIC: this module holds no sentences any more. It
   decides which case applies and returns a translation key, and `t` is
   passed in so the call site still reads as one line. These are the
   messages a student meets most often - an expired session, an unreachable
   API - so leaving them in English would have left English scattered through
   an otherwise Arabic app.

   The server's own `detail` goes through lib/serverErrors.js first. If that
   recognises it, the student gets it translated; if not, it is shown exactly
   as the server wrote it, in English. Read the warning at the top of that
   file before changing anything on either side.
   ========================================================================== */

import { translateServerMessage } from './serverErrors'

/**
 * @param t            from useI18n(), so this module never holds a sentence
 * @param error        whatever axios threw
 * @param fallbackKey  what to say when nothing more specific is known - a
 *                     key, not a sentence
 */
export function getErrorMessage(error, t, fallbackKey = 'errors.generic') {
  if (!error) return t(fallbackKey)

  if (error.response) {
    const { status, data } = error.response
    const detail = data?.detail

    /* ---- 422, which arrives as a list of field problems ---------------- */

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          const msg = item?.msg
          if (!msg) return null

          /* Pydantic writes these, not us, so they stay in English. The
             field name in front of them is the API's too. */
          const field = fieldNameFromLoc(item?.loc)
          return field ? `${field}: ${msg}` : msg
        })
        .filter(Boolean)
      if (messages.length) return messages.join('\n')
    }

    /* ---- A single sentence from the backend ---------------------------- */

    if (typeof detail === 'string' && detail.trim()) {
      return translateServerMessage(t, detail) ?? detail
    }

    if (typeof data === 'string' && data.trim()) {
      return translateServerMessage(t, data) ?? data
    }

    if (data?.message) return String(data.message)

    /* ---- The server said nothing useful -------------------------------- */

    if (status === 401) return t('errors.sessionExpired')
    if (status === 403) return t('errors.forbidden')
    if (status === 404) return t('errors.notFound')

    return t('errors.requestFailed', { status })
  }

  if (error.request) {
    return t('errors.unreachable')
  }

  /* error.message is the browser's or axios's own wording. It is English and
     stays English - inventing a translation for a message we did not write
     would mean claiming to know what it says. */
  return error.message || t(fallbackKey)
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
