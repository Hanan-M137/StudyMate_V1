/* ==========================================================================
   The backend's own error messages, recognised and translated.

   SOURCE: backend/main.py. Every English sentence below is copied from a
   `detail=` in that file, and the match is made on the exact string the API
   sends back.

   WHAT THIS MIRRORS - the messages a student meets in ordinary use:
     - the password rules (validate_password)
     - a wrong email or password at sign-in
     - an email that is already registered
     - a file that is not a PDF
     - a wrong current password when changing it
     - the quiz form's validation: question count, question types,
       and the page range

   Everything else main.py can say is deliberately left alone and reaches the
   student in English. Those are the messages the interface either prevents
   outright or that only appear when something is already wrong - "Document
   not found", "An error occurred while processing the AI request", and the
   rest.

   ---------------------------------------------------------------------------
   THIS IS STRING MATCHING AND IT IS BRITTLE.

   Nothing connects these strings to main.py except the fact that somebody
   typed them the same way twice. Reword a `detail=` over there - even by a
   comma - and that message silently stops being recognised here and
   reappears in English on an otherwise Arabic page. Nothing fails, no test
   goes red, and nobody finds out until a student sees it.

   That is the accepted cost of not restructuring the API to return error
   codes. If main.py is ever free to change, an error code per failure is the
   fix, and this file goes away.
   ---------------------------------------------------------------------------
   ========================================================================== */

import { MIN_PASSWORD_LENGTH, PASSWORD_ERROR_KEYS } from './password'

/* ==========================================================================
   Messages that are always word for word the same
   ========================================================================== */

const EXACT = {
  'Invalid email or password': 'server.invalidCredentials',
  'Email already registered': 'server.emailRegistered',
  'Only PDF files are supported': 'server.onlyPdf',
  'Current password is incorrect': 'server.currentPasswordIncorrect',

  'num_questions must be at least 1': 'server.numQuestionsMin',
  'num_questions cannot exceed 50': 'server.numQuestionsMax',

  'Give both a first and a last page, or neither.': 'server.pageRangeBoth',
  'The first page must be 1 or greater.': 'server.firstPageMin',
  'The last page cannot come before the first page.': 'server.lastPageBeforeFirst',
}

/* ==========================================================================
   Messages with numbers in them
   ========================================================================== */

/* Matched by shape rather than by text, and the numbers are pulled out so
   the translated sentence can put them back wherever that language wants
   them. */
const PATTERNS = [
  {
    /* "3 question(s) is not enough for 3 question type(s): each type you
        pick needs at least one question." */
    test: /^(\d+) question\(s\) is not enough for (\d+) question type\(s\)/,
    key: 'server.notEnoughQuestions',
    vars: (m) => ({ count: m[1], types: m[2] }),
  },
  {
    /* "This document has 12 pages, so it has no page 40." */
    test: /^This document has (\d+) pages, so it has no page (\d+)\.$/,
    key: 'server.noSuchPage',
    vars: (m) => ({ pages: m[1], page: m[2] }),
  },
]

/* ==========================================================================
   The password sentences
   ========================================================================== */

/* validate_password builds one sentence out of up to three fragments, joined
   with ", " and " and ", always in the order length, letter, digit. Rather
   than parse that back apart, the seven sentences it can produce are
   generated here from the same pieces and looked up whole - which is also
   why lib/password.js keeps one key per combination.

   The result is that the same broken password reads identically whether the
   browser caught it or the server did, in either language. */
const PASSWORD_FRAGMENTS = {
  length: `be at least ${MIN_PASSWORD_LENGTH} characters long`,
  letter: 'contain at least one letter',
  digit: 'contain at least one digit',
}

function passwordSentences() {
  const sentences = {}

  for (const combination of Object.keys(PASSWORD_ERROR_KEYS)) {
    const parts = combination.split('+').map((rule) => PASSWORD_FRAGMENTS[rule])

    const requirements =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

    sentences[`Password must ${requirements}.`] = PASSWORD_ERROR_KEYS[combination]
  }

  return sentences
}

const PASSWORD_SENTENCES = passwordSentences()

/* ==========================================================================
   The lookup
   ========================================================================== */

/**
 * Translate a `detail` string from the API, or return null if we do not
 * recognise it.
 *
 * Returning null rather than a guess is the point: an unrecognised message
 * is passed through to the student in English, which is worse than Arabic
 * and far better than the wrong sentence.
 */
export function translateServerMessage(t, detail) {
  if (typeof detail !== 'string') return null

  const text = detail.trim()
  if (!text) return null

  if (EXACT[text]) return t(EXACT[text])

  if (PASSWORD_SENTENCES[text]) {
    return t(PASSWORD_SENTENCES[text], { min: MIN_PASSWORD_LENGTH })
  }

  for (const { test, key, vars } of PATTERNS) {
    const match = text.match(test)
    if (match) return t(key, vars(match))
  }

  return null
}
