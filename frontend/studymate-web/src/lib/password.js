/* ==========================================================================
   The password rules, client-side.

   A mirror of validate_password in backend/main.py - deliberately a mirror
   and not the authority. The server re-checks everything, because a check
   that only runs in the browser is not a rule. What this buys is the common
   case: a student who types six letters hears about it while the field is
   still in front of them, instead of after a round trip.

   Kept in one module so the Register page and the change-password form in
   Settings cannot drift apart.

   WHAT CHANGED FOR ARABIC: this module used to build the sentence itself,
   joining fragments with ", " and " and ". That cannot be translated - the
   fragments would come out as Arabic words strung together with English
   grammar. So it no longer produces a sentence at all. It decides which
   rules were broken and returns the key of the one whole sentence that says
   so; the component translates it. There are seven keys because three rules
   have seven non-empty combinations, and a whole sentence per combination is
   the only shape that can be written correctly in both languages.
   ========================================================================== */

/* The same 8 the backend uses. If it ever moves, both sides move. */
export const MIN_PASSWORD_LENGTH = 8

/* Shown before the student types anything, which is the point: the rules
   are cheapest to follow when they are known in advance. Interpolated with
   { min: MIN_PASSWORD_LENGTH } at the call site. */
export const PASSWORD_HINT_KEY = 'password.hint'

/* Unicode-aware, matching the backend's str.isalpha() / str.isdigit(). The
   \p{L} and \p{N} classes cover Arabic, which /[a-zA-Z]/ and /[0-9]/ would
   not - and a client check that is stricter than the server would reject a
   password the server was perfectly happy to store. */
const HAS_LETTER = /\p{L}/u
const HAS_NUMBER = /\p{N}/u

/* ==========================================================================
   One key per combination of broken rules
   ========================================================================== */

/* The combination is written in the order the rules are checked - length,
   letter, digit - which is also the order validate_password names them in,
   so lib/serverErrors.js can rebuild the server's sentence from the same
   table and land on the same key. */
export const PASSWORD_ERROR_KEYS = {
  length: 'password.errLength',
  letter: 'password.errLetter',
  digit: 'password.errDigit',
  'length+letter': 'password.errLengthLetter',
  'length+digit': 'password.errLengthDigit',
  'letter+digit': 'password.errLetterDigit',
  'length+letter+digit': 'password.errLengthLetterDigit',
}

/**
 * The key of the sentence describing everything wrong with this password, or
 * null when there is nothing wrong with it.
 *
 * Every broken rule is named in one sentence rather than one at a time, so a
 * student fixing a short digitless password does not have to submit twice to
 * learn about both problems.
 *
 * Interpolate the result with { min: MIN_PASSWORD_LENGTH }.
 */
export function getPasswordErrorKey(password) {
  const value = password ?? ''

  const broken = []

  if (value.length < MIN_PASSWORD_LENGTH) broken.push('length')

  if (!HAS_LETTER.test(value)) broken.push('letter')

  if (!HAS_NUMBER.test(value)) broken.push('digit')

  if (broken.length === 0) return null

  return PASSWORD_ERROR_KEYS[broken.join('+')]
}
