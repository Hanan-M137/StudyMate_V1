/* ==========================================================================
   Theme - system / light / dark.

   The same three lines of logic exist twice: here, and inline in the <head>
   of index.html. That is not an oversight. The inline copy runs before the
   app bundle is even fetched, because a preference read after React boots
   means a white page for a fraction of a second on every single load. This
   module is what the running app uses afterwards; the two must agree, so the
   key and the values are written the same way in both.
   ========================================================================== */

const STORAGE_KEY = 'studymate.theme'

/* 'system' is the default and stays the default: a student who has never
   opened the settings page gets whatever their operating system is already
   set to, which is the answer they have effectively already given. */
export const THEMES = ['system', 'light', 'dark']

const DEFAULT_THEME = 'system'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/* ==========================================================================
   Reading and writing the preference
   ========================================================================== */

/**
 * The stored choice, or 'system' when there is none.
 *
 * Anything unrecognised is treated as no choice at all rather than trusted:
 * local storage is shared with whatever else runs on this origin, and a
 * junk value would otherwise be written straight into the document.
 */
export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(stored) ? stored : DEFAULT_THEME
  } catch {
    /* Private windows and blocked site data both throw here. */
    return DEFAULT_THEME
  }
}

/** Store the choice and apply it at once - there is no save button. */
export function setTheme(value) {
  const theme = THEMES.includes(value) ? value : DEFAULT_THEME

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* The theme still applies to this page; it just will not survive a reload. */
  }

  applyTheme(theme)

  return theme
}

/* ==========================================================================
   Applying it to the document
   ========================================================================== */

/** 'system' resolved against the OS; 'light' and 'dark' are already answers. */
function resolveTheme(value) {
  if (value === 'light' || value === 'dark') return value

  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Write the resolved theme onto <html>, which is the only thing the CSS
 * looks at: index.css styles :root[data-theme="dark"] and nothing else.
 */
export function applyTheme(value) {
  const resolved = resolveTheme(value)

  try {
    document.documentElement.dataset.theme = resolved
  } catch {
    /* No document - nothing to theme. */
  }

  return resolved
}

/* ==========================================================================
   Following the system while 'system' is chosen
   ========================================================================== */

/**
 * Keep the document in step with the OS while the choice is 'system', and
 * return a teardown function.
 *
 * Only 'system' subscribes. An explicit light or dark choice is an
 * instruction to ignore the OS, so following it afterwards would quietly
 * overrule the student the next time their machine switched at sunset.
 */
export function watchSystemTheme(value) {
  if (value !== 'system') return () => {}

  let query

  try {
    query = window.matchMedia(DARK_QUERY)
  } catch {
    return () => {}
  }

  const handleChange = () => applyTheme('system')

  query.addEventListener('change', handleChange)

  return () => query.removeEventListener('change', handleChange)
}
