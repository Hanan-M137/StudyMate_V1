/* ==========================================================================
   Language - English / Arabic.

   Written to mirror theme.js on purpose: same storage pattern, same
   try/catch around every access, same "store it and apply it at once" shape.
   The two are sibling preferences and a student meets them on the same
   settings page, so they should not look like they were written by different
   people.

   As with the theme, the same few lines exist twice: here, and inline in the
   <head> of index.html. The inline copy runs before the app bundle is
   fetched, because a direction read after React boots flips the entire
   layout from left-to-right to right-to-left in front of the student - a
   far larger jump than the colour flash the theme script already prevents.
   This module is what the running app uses afterwards; the two must agree,
   so the key and the values are written the same way in both.
   ========================================================================== */

const STORAGE_KEY = 'studymate.lang'

export const LANGUAGES = ['en', 'ar']

/* English on a first visit, always, and deliberately not navigator.language.

   A browser reporting Arabic is not the same as a student wanting this
   interface in Arabic: the documents are Arabic, the interface is a tool,
   and guessing wrong flips the whole layout before anyone has asked for it.
   The choice is one click away on the settings page, and it is remembered
   from then on. */
export const DEFAULT_LANGUAGE = 'en'

/* ==========================================================================
   Reading and writing the preference
   ========================================================================== */

/**
 * The stored choice, or 'en' when there is none.
 *
 * Anything unrecognised is treated as no choice at all rather than trusted,
 * for the same reason getStoredTheme does it: local storage is shared with
 * whatever else runs on this origin, and a junk value would otherwise be
 * written straight into the document's lang and dir.
 */
export function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    /* Private windows and blocked site data both throw here. */
    return DEFAULT_LANGUAGE
  }
}

/** Store the choice and apply it at once - there is no save button. */
export function setLanguage(value) {
  const language = LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE

  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    /* The language still applies to this page; it just will not survive a reload. */
  }

  applyLanguage(language)

  return language
}

/* ==========================================================================
   Applying it to the document
   ========================================================================== */

/**
 * Write the language onto <html>, as both `lang` and `dir`.
 *
 * Both, not just one. `lang` is what a screen reader picks a voice from and
 * what the browser hyphenates by; `dir` is what actually mirrors the layout.
 * Setting one without the other gives an Arabic page read in an English
 * voice, or an English page laid out backwards.
 *
 * There is no resolve step here and no watcher, which is the one place this
 * module is shorter than theme.js: 'system' had to be resolved against the
 * OS and followed when the OS changed, and a language has no equivalent -
 * 'en' and 'ar' are both already answers.
 */
export function applyLanguage(value) {
  const language = LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE

  try {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  } catch {
    /* No document - nothing to apply it to. */
  }

  return language
}

/* ==========================================================================
   Putting content inside interface text
   ========================================================================== */

/* U+2068 FIRST STRONG ISOLATE and U+2069 POP DIRECTIONAL ISOLATE.

   The text-level equivalent of dir="auto", for the places where a piece of
   the student's content is dropped into a sentence of ours and there is no
   element to hang an attribute on - a document title inside "Quizzes from
   {title}", say.

   Without them the browser runs its bidi algorithm over the whole sentence
   at once, and an English title inside an Arabic sentence drags the
   surrounding punctuation to the wrong end: the full stop lands at the far
   left, quotation marks swap sides. The isolate tells the browser to work
   the title out on its own and then put the result back as one unit.

   Both characters are invisible and have no width. They are safe in an
   English interface too, which is why the call sites do not check the
   language first. */
const FIRST_STRONG_ISOLATE = '⁨'
const POP_DIRECTIONAL_ISOLATE = '⁩'

export function isolate(value) {
  if (value == null || value === '') return ''

  return `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`
}

/* ==========================================================================
   Dates
   ========================================================================== */

/**
 * The locale to format dates and times in.
 *
 * `ar-u-nu-latn`, not plain `ar`: Arabic month names, Latin digits. Plain
 * `ar` would bring Arabic-Indic digits (١٢٣) with it, and every other number
 * in this app - scores, page numbers, the timer - is written in Latin
 * digits. One page with both would look like a mistake, because it would be.
 *
 * `undefined` for English hands the choice back to the browser, which is
 * what these formatters did before there was a second language: a student in
 * Britain gets a British date, one in the United States an American one.
 */
export function dateLocale(language) {
  return language === 'ar' ? 'ar-u-nu-latn' : undefined
}
