/* ==========================================================================
   The password rules, client-side.

   A mirror of validate_password in backend/main.py - deliberately a mirror
   and not the authority. The server re-checks everything, because a check
   that only runs in the browser is not a rule. What this buys is the common
   case: a student who types six letters hears about it while the field is
   still in front of them, instead of after a round trip.

   Kept in one module so the Register page and the change-password form in
   Settings cannot drift apart, and so the sentence shown as a hint is built
   from the same numbers as the sentence shown as an error.
   ========================================================================== */

/* The same 8 the backend uses. If it ever moves, both sides move. */
export const MIN_PASSWORD_LENGTH = 8

/* Shown before the student types anything, which is the point: the rules
   are cheapest to follow when they are known in advance. */
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a digit.`

/* Unicode-aware, matching the backend's str.isalpha() / str.isdigit(). The
   \p{L} and \p{N} classes cover Arabic, which /[a-zA-Z]/ and /[0-9]/ would
   not - and a client check that is stricter than the server would reject a
   password the server was perfectly happy to store. */
const HAS_LETTER = /\p{L}/u
const HAS_NUMBER = /\p{N}/u

/**
 * Returns an error sentence for a password that breaks the rules, or null
 * when it is acceptable.
 *
 * Every broken rule is named in one sentence rather than one at a time, so
 * a student fixing a short digitless password does not have to submit twice
 * to learn about both problems. The wording matches what the API would have
 * answered, so the message does not change shape depending on which side
 * caught it.
 */
export function getPasswordError(password) {
  const value = password ?? ''

  const problems = []

  if (value.length < MIN_PASSWORD_LENGTH) {
    problems.push(`be at least ${MIN_PASSWORD_LENGTH} characters long`)
  }

  if (!HAS_LETTER.test(value)) {
    problems.push('contain at least one letter')
  }

  if (!HAS_NUMBER.test(value)) {
    problems.push('contain at least one digit')
  }

  if (problems.length === 0) return null

  const requirements =
    problems.length === 1
      ? problems[0]
      : `${problems.slice(0, -1).join(', ')} and ${problems[problems.length - 1]}`

  return `Password must ${requirements}.`
}
