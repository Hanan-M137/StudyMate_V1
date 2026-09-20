/* ==========================================================================
   The six-digit code, as the student may actually type it.

   A mirror of VERIFICATION_DIGIT_TRANSLATION in backend/main.py, and
   deliberately a mirror rather than the authority: the server normalises the
   code again before it compares anything, because a rule that only runs in
   the browser is not a rule. What this buys is that the field shows the code
   in the shape it will be sent in, while it is still being typed.

   WHY THIS EXISTS AT ALL: this app's students write Arabic, and an Arabic
   keyboard set to Arabic numerals types ٠١٢ where the email says 012. Those
   are the same code to the person reading it, and a field that silently
   dropped them - which is what /[^0-9]/ does - would refuse a correct answer
   over a keyboard layout. Both Arabic-Indic ranges are handled: the Arabic
   one and the extended Persian/Urdu one.

   Everything that is not a digit in one of those three scripts is dropped,
   which is what makes a pasted code work. A code arrives out of an email
   with a space, a full stop or a stray newline around it often enough, and
   the student pasting it has no reason to tidy it up first.
   ========================================================================== */

/* The same six the backend generates with secrets.randbelow. If that ever
   moves, both sides move. */
export const VERIFICATION_CODE_LENGTH = 6

const LATIN_ZERO = 0x0030
const ARABIC_INDIC_ZERO = 0x0660
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0

/** One character's numeric value, or null if it is not a digit we accept. */
function digitValue(character) {
  const code = character.codePointAt(0)

  for (const zero of [LATIN_ZERO, ARABIC_INDIC_ZERO, EXTENDED_ARABIC_INDIC_ZERO]) {
    if (code >= zero && code <= zero + 9) return code - zero
  }

  return null
}

/**
 * Whatever was typed or pasted, as up to six Latin digits.
 *
 * Truncates rather than refuses: a paste that brought a signature along with
 * it should fill the field, not empty it.
 */
export function normalizeVerificationCode(value) {
  if (typeof value !== 'string') return ''

  let code = ''

  for (const character of value) {
    const digit = digitValue(character)

    if (digit === null) continue

    code += String(digit)

    if (code.length === VERIFICATION_CODE_LENGTH) break
  }

  return code
}
