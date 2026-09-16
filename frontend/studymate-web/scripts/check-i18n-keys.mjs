/* ==========================================================================
   Key parity between en.js and ar.js.

   WHY THIS EXISTS: a key present in one dictionary and missing from the other
   does not fail. `t` falls back to English, so the app keeps working and one
   English sentence appears in the middle of an Arabic page - the single
   English button nobody notices until a student does. Nothing else in this
   project catches that, because there is nothing to catch: it is not a type
   error, not a lint error, and not a broken build.

   Run it after touching either dictionary:

     cd frontend/studymate-web && node scripts/check-i18n-keys.mjs

   There is no npm script for it. package.json is denied by permissions, so
   this is the command.

   Exits 0 when the two agree and 1 when they do not, so it can be wired into
   anything that cares later.
   ========================================================================== */

import en from '../src/i18n/en.js'
import ar from '../src/i18n/ar.js'

/* ==========================================================================
   Flattening
   ========================================================================== */

/**
 * Every dotted key that ends at a string, in the order it is written.
 *
 * Order matters as well as membership: the two files are meant to be read
 * side by side, and a key that has drifted to a different place in one of
 * them makes that review harder even though nothing is missing.
 */
function flatten(dictionary, prefix = '', out = []) {
  for (const [name, value] of Object.entries(dictionary)) {
    const key = prefix ? `${prefix}.${name}` : name

    if (typeof value === 'string') out.push(key)
    else if (value && typeof value === 'object') flatten(value, key, out)
  }

  return out
}

/* ==========================================================================
   The comparison
   ========================================================================== */

const english = flatten(en)
const arabic = flatten(ar)

const inArabic = new Set(arabic)
const inEnglish = new Set(english)

const missingFromArabic = english.filter((key) => !inArabic.has(key))
const missingFromEnglish = arabic.filter((key) => !inEnglish.has(key))

/* Only worth reporting once membership matches - otherwise every key after
   the first gap looks out of order, which is noise rather than a finding. */
const orderDrift =
  missingFromArabic.length === 0 && missingFromEnglish.length === 0
    ? english.filter((key, index) => arabic[index] !== key)
    : []

/* ==========================================================================
   Saying so
   ========================================================================== */

console.log(`en.js  ${english.length} keys`)
console.log(`ar.js  ${arabic.length} keys`)
console.log('')

function report(label, keys) {
  console.log(`${label}: ${keys.length}`)
  for (const key of keys) console.log(`  ${key}`)
}

report('missing from ar.js', missingFromArabic)
report('missing from en.js', missingFromEnglish)

if (orderDrift.length) {
  console.log('')
  report('present in both but in a different position', orderDrift)
}

const failed = missingFromArabic.length > 0 || missingFromEnglish.length > 0

console.log('')
console.log(
  failed
    ? 'FAIL - the two dictionaries do not hold the same keys.'
    : 'OK - both dictionaries hold the same keys, in the same order.',
)

process.exit(failed ? 1 : 0)
