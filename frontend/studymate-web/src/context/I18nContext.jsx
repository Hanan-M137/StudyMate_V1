import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LANGUAGE,
  applyLanguage,
  getStoredLanguage,
  setLanguage,
} from '../lib/language'
import en from '../i18n/en'
import ar from '../i18n/ar'

/* ==========================================================================
   The translation context.

   Sixty-odd lines instead of a package. The whole job is a nested object, a
   dotted lookup, a fallback and a placeholder substitution, and every one of
   those is shorter to write than the configuration a library would need -
   and cannot drift out of date, because there is nothing to update.
   ========================================================================== */

const DICTIONARIES = {
  en,
  ar,
}

const I18nContext = createContext(null)

/* ==========================================================================
   Looking a key up
   ========================================================================== */

/**
 * Walk a dotted key ('quiz.startPage') down a nested dictionary.
 *
 * Returns undefined for anything that is not a string at the end of the
 * walk, so a half-filled branch - `quiz` present but `quiz.startPage`
 * missing - is a miss rather than an object rendered as [object Object].
 */
function lookup(dictionary, key) {
  let node = dictionary

  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined

    node = node[part]
  }

  return typeof node === 'string' ? node : undefined
}

/**
 * Fill {name} placeholders from `vars`.
 *
 * A placeholder with nothing to fill it is left standing rather than
 * replaced with an empty string, for the same reason a missing key shows
 * itself: a visible {name} is a bug someone reports, and a blank space is a
 * bug nobody notices.
 */
function interpolate(template, vars) {
  if (!vars) return template

  return template.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : placeholder,
  )
}

/* ==========================================================================
   The provider
   ========================================================================== */

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getStoredLanguage)

  /* The inline script in index.html has already written lang and dir onto
     <html> from the same storage key, so this agrees with what is on screen
     rather than changing it. It is here for the case the script could not
     run, and for every later switch. */
  useEffect(() => {
    applyLanguage(lang)
  }, [lang])

  const setLang = useCallback((value) => {
    setLangState(setLanguage(value))
  }, [])

  const t = useCallback(
    (key, vars) => {
      /* English is the fallback for every key the current dictionary does
         not have, which is what lets a translation be filled in a piece at a
         time: a half-translated app reads as English in the gaps rather than
         falling apart.

         A key missing from both dictionaries returns itself. Deliberately:
         `quiz.startPage` on screen is a missing translation anyone can see
         and report, where an empty string is a blank space that ships. */
      const text =
        lookup(DICTIONARIES[lang], key) ??
        lookup(DICTIONARIES[DEFAULT_LANGUAGE], key) ??
        key

      return interpolate(text, vars)
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>')
  return context
}
