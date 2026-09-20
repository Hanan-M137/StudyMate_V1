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
     - a file whose type is not accepted at all, one that is over the
       general upload limit, one that is over the lower limit that applies
       only to files needing conversion, and a server that cannot convert
     - a wrong current password when changing it
     - the quiz form's validation: question count, question types,
       and the page range
     - the contact form's refusals: an empty message, one that is too
       short or too long, and too many messages in one hour
     - email verification: the 403 at sign-in for an address that has not
       been verified, the single sentence every verify-email failure
       answers with, and the 429 for too many codes in one hour

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
  /* Still sent when ENABLE_FILE_CONVERSION is off, which is the whole
     point of that switch: the API says exactly what it said before the
     conversion feature existed. */
  'Only PDF files are supported': 'server.onlyPdf',

  'Supported file types are PDF, Word, PowerPoint, Excel and OpenDocument.':
    'server.unsupportedType',

  /* A 503, not a 400. The file was fine; the server could not convert it.
     The English does not name LibreOffice and neither does the Arabic -
     the student cannot install it, and the server log says so for the
     person who can. */
  'This file type cannot be converted on the server right now. Please upload a PDF instead.':
    'server.conversionUnavailable',

  'Current password is incorrect': 'server.currentPasswordIncorrect',

  /* SOURCE: the /contact endpoint in backend/main.py.

     An empty message, and the 429 when one account has sent too many in
     an hour. Neither sentence carries a number - the rate limit's own
     wording deliberately does not name the limit - so both match whole.
     The two length refusals do carry one and are down in PATTERNS. */
  'Please write a message before sending.': 'server.contactEmpty',

  'You have sent several messages in the last hour. Please wait a while before sending another.':
    'server.contactRateLimited',

  /* SOURCE: the three email-verification endpoints in backend/main.py.

     The first is the 403 from /auth/login - the only 403 that endpoint
     sends, and the one the sign-in page turns into the code field rather
     than a dead end.

     The second is every failure /auth/verify-email has: a wrong code, an
     expired one, a spent one, too many guesses, and an address with no
     account behind it all answer with this one sentence. Matching it whole
     is exactly right, because there is only one.

     The third is the 429 from /auth/resend-verification. Like the contact
     form's, it carries no number - MAX_VERIFICATION_CODES_PER_HOUR stays in
     main.py - so it matches whole rather than by shape. */
  'This email address has not been verified yet. Enter the code we sent you, or ask for a new one.':
    'server.emailNotVerified',

  'That code is not valid. Ask for a new one and try again.':
    'server.verificationCodeInvalid',

  'Too many codes have been requested for this account. Please wait a while before asking for another.':
    'server.verificationRateLimited',

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
  {
    /* "This file is larger than the 200 MB upload limit."

       The number comes from MAX_UPLOAD_MB, which the owner sets in .env,
       so it is read out of the message rather than repeated over here
       where it would go stale the first time that value changed. */
    test: /^This file is larger than the (\d+) MB upload limit\.$/,
    key: 'server.uploadTooLarge',
    vars: (m) => ({ limit: m[1] }),
  },
  {
    /* "Office documents are limited to 100 MB because they have to be
        converted first. PDF files up to 200 MB are accepted."

       Deliberately a separate key from the one above. Both are a 413 about
       a file being too big, but this one is the only place a student is
       told that the same file as a PDF would have gone through - which is
       the one piece of information that lets them do something about it. */
    test: /^Office documents are limited to (\d+) MB because they have to be converted first\. PDF files up to (\d+) MB are accepted\.$/,
    key: 'server.convertTooLarge',
    vars: (m) => ({ convertLimit: m[1], uploadLimit: m[2] }),
  },
  {
    /* "A message must be at least 10 characters long."

       SOURCE: the /contact endpoint in backend/main.py. The number is
       MIN_CONTACT_MESSAGE_LENGTH, which lives over there, so it is read
       out of the message rather than written again here - the same
       reason the upload limits above are matched by shape. */
    test: /^A message must be at least (\d+) characters long\.$/,
    key: 'server.contactTooShort',
    vars: (m) => ({ min: m[1] }),
  },
  {
    /* "A message cannot be longer than 5000 characters."
       MAX_CONTACT_MESSAGE_LENGTH, read out for the same reason. */
    test: /^A message cannot be longer than (\d+) characters\.$/,
    key: 'server.contactTooLong',
    vars: (m) => ({ max: m[1] }),
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
