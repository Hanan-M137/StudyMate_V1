import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { changePassword, deleteAccount, updateProfile } from '../api/auth'
import { setTokens } from '../api/tokens'
import { getErrorMessage } from '../lib/errors'
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT_KEY,
  getPasswordErrorKey,
} from '../lib/password'
import { LANGUAGES, isolate } from '../lib/language'
import { THEMES, getStoredTheme, setTheme, watchSystemTheme } from '../lib/theme'
import IntroVideo from '../components/IntroVideo'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  InlineError,
  PasswordInput,
} from '../components/ui'

/* ==========================================================================
   Settings - appearance, account, and what StudyMate is.

   Four sections. Everything here either works completely or is not on the
   page: a control that does nothing is worse than no control, because it
   makes a promise the app cannot keep. The last section holds no control at
   all - it is the intro video, which is the same card the sign-in page shows
   and is rendered, heading and all, by the component.

   WHY DELETING THE ACCOUNT IS ITS OWN CARD rather than a third form inside
   Account: the two forms above it change something and can be changed back,
   and this one cannot be undone by any means the app or its owner has. A
   button that destroys everything, sitting directly under a button that
   renames you, reads as one more setting. Its own card, below the rest, is
   what says it is not.
   ========================================================================== */

/* Keys rather than words: THEMES is a list of values from lib/theme.js and
   these two maps are read out here, outside any component, so the lookup has
   to happen where the radio row renders. */
const THEME_LABEL_KEYS = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
}

const THEME_HINT_KEYS = {
  system: 'settings.themeSystemHint',
  light: 'settings.themeLightHint',
  dark: 'settings.themeDarkHint',
}

/* Each language names itself, and neither name is ever translated. A student
   looking for Arabic is looking for the word "العربية" - not for whatever the
   English interface has decided to call it, which they would have to already
   read English to recognise. This is the one row of text in the app that is
   deliberately the same in both dictionaries by not being in either. */
const LANGUAGE_LABELS = {
  en: 'English',
  ar: 'العربية',
}

export default function Settings() {
  const { t } = useI18n()

  return (
    <div className="no-print space-y-6">
      <header>
        <h1 className="type-display">{t('settings.title')}</h1>
        <p className="type-small mt-1 text-muted">{t('settings.subtitle')}</p>
      </header>

      <AppearanceSection />
      <AccountSection />
      <DeleteAccountSection />

      {/* Last, and a section like the two above it: the space-y-6 on the
          wrapper gives it the same gap, and IntroVideo renders the same
          Card / CardHeader / CardBody the other two are built from. There
          is nothing to configure here, which is why it comes after the two
          sections that do something. */}
      <IntroVideo />
    </div>
  )
}

/* ==========================================================================
   Appearance
   ========================================================================== */

function AppearanceSection() {
  const { t, lang, setLang } = useI18n()

  /* Read once, from storage rather than from the document: the inline script
     in index.html has already resolved 'system' into a light or dark
     attribute, so reading the document back would turn a preference of
     "follow my machine" into a fixed choice the student never made. */
  const [theme, setThemeState] = useState(getStoredTheme)

  /* While the choice is 'system', the OS can change underneath the page - at
     sunset, or when someone flips it in another window - and the page has to
     follow. watchSystemTheme subscribes only in that case and returns the
     unsubscribe, so switching to an explicit choice tears the listener down. */
  useEffect(() => watchSystemTheme(theme), [theme])

  function choose(value) {
    setThemeState(setTheme(value))
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="type-title">{t('settings.appearance')}</h2>
      </CardHeader>

      <CardBody className="space-y-7">
        {/* Language sits above the theme because it is the larger of the two
            choices: the theme repaints the page, the language rewrites it and
            turns the layout round. Same control as the theme below - a radio
            group that takes effect on the spot, with nothing to save. */}
        <fieldset>
          <legend className="mb-2.5 block text-sm font-medium text-ink-soft">
            {t('settings.language')}
          </legend>

          <div className="space-y-2">
            {LANGUAGES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3.5 py-3 transition-colors duration-150 hover:bg-sunken has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="language"
                  value={value}
                  checked={lang === value}
                  onChange={() => setLang(value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                {/* `lang` on the label itself, not just on <html>: this is the
                    one place a language name appears inside the other
                    language, and saying which language the word is in is what
                    gets it the right typeface and the right screen-reader
                    voice while the interface is still English. */}
                <span className="min-w-0">
                  <span lang={value} className="block text-sm font-medium text-ink">
                    {LANGUAGE_LABELS[value]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* A radio group, not a dropdown: three options, all worth seeing at
            once, and the choice takes effect on the spot - there is nothing
            to save, so there is no save button. */}
        <fieldset>
          <legend className="mb-2.5 block text-sm font-medium text-ink-soft">
            {t('settings.theme')}
          </legend>

          <div className="space-y-2">
            {THEMES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-sm border border-line px-3.5 py-3 transition-colors duration-150 hover:bg-sunken has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => choose(value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {t(THEME_LABEL_KEYS[value])}
                  </span>
                  <span className="type-small block text-muted">
                    {t(THEME_HINT_KEYS[value])}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  )
}

/* ==========================================================================
   Account
   ========================================================================== */

function AccountSection() {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader>
        <h2 className="type-title">{t('settings.account')}</h2>
      </CardHeader>

      <CardBody className="space-y-7">
        <NameForm />
        <PasswordForm />
      </CardBody>
    </Card>
  )
}

/* ---- Name --------------------------------------------------------------- */

function NameForm() {
  const { fullName, email, applyProfile } = useAuth()
  const { t } = useI18n()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  /* null means "nothing typed yet", which is not the same as an empty field.
     The name arrives from GET /auth/me a moment after the page mounts, so
     until the student touches the input it simply shows whatever the context
     currently holds - no effect, and no empty field left behind by a
     response that landed after the first render. Once they type, their draft
     takes over and a late response cannot overwrite it. */
  const [draft, setDraft] = useState(null)

  const name = draft ?? (fullName || '')

  async function handleSubmit(event) {
    event.preventDefault()

    setError(null)
    setSaved(false)
    setSaving(true)

    try {
      const user = await updateProfile({ fullName: name })

      /* Straight into the context, so the sidebar changes in the same moment
         rather than on the next page load. The server's copy is used, not
         the typed one: it has been trimmed. */
      applyProfile(user)

      // Back to following the context, which now holds what was just saved.
      setDraft(null)
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, t, 'settings.couldNotSaveName'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <Field
        label={t('settings.name')}
        hint={email ? t('settings.signedInAs', { email: isolate(email) }) : undefined}
      >
        {(field) => (
          <Input
            {...field}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setSaved(false)
              setDraft(event.target.value)
            }}
          />
        )}
      </Field>

      <InlineError message={error} />
      <SuccessNote message={saved ? t('settings.nameSaved') : null} />

      <Button type="submit" loading={saving} disabled={!name.trim()}>
        {t('settings.saveName')}
      </Button>
    </form>
  )
}

/* ---- Password ----------------------------------------------------------- */

function PasswordForm() {
  const { t } = useI18n()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setError(null)
    setSaved(false)

    /* The rules first, and before the confirmation check: a password that
       cannot be used at all is worth saying so about even if the second
       field also disagrees, and it is the mistake the student can fix
       without retyping both. Mirrors validate_password on the server,
       which checks again regardless. */
    const passwordErrorKey = getPasswordErrorKey(newPassword)
    if (passwordErrorKey) {
      setError(t(passwordErrorKey, { min: MIN_PASSWORD_LENGTH }))
      return
    }

    /* Caught here rather than sent: the server has no way to tell a typo in
       the confirmation from a wrong new password, so it would answer a
       question nobody meant to ask. */
    if (newPassword !== confirmPassword) {
      setError(t('settings.passwordsDoNotMatch'))
      return
    }

    setSaving(true)

    try {
      const tokens = await changePassword({ currentPassword, newPassword })

      /* Changing the password revokes every token the account holds,
         including the one this browser just used. These are the replacement
         pair, so storing them is what keeps the student signed in here while
         every other session ends. */
      setTokens(tokens)

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, t, 'settings.couldNotChangePassword'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-line pt-6" noValidate>
      <p className="text-sm font-medium text-ink">{t('settings.changePasswordHeading')}</p>

      <Field label={t('settings.currentPassword')} required>
        {(field) => (
          <PasswordInput
            {...field}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setSaved(false)
              setCurrentPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <Field
        label={t('settings.newPassword')}
        required
        hint={t(PASSWORD_HINT_KEY, { min: MIN_PASSWORD_LENGTH })}
      >
        {(field) => (
          <PasswordInput
            {...field}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => {
              setSaved(false)
              setNewPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <Field label={t('settings.confirmNewPassword')} required>
        {(field) => (
          <PasswordInput
            {...field}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setSaved(false)
              setConfirmPassword(event.target.value)
            }}
          />
        )}
      </Field>

      <InlineError message={error} />
      <SuccessNote
        message={
          saved ? t('settings.passwordChanged') : null
        }
      />

      <Button
        type="submit"
        loading={saving}
        disabled={!currentPassword || !newPassword || !confirmPassword}
      >
        {t('settings.changePassword')}
      </Button>
    </form>
  )
}

/* ==========================================================================
   Delete account

   The only control in this app that destroys data nobody can get back.
   Confirming it removes the user row, and every document, chunk,
   conversation, message, quiz, question and attempt hanging off it, at
   once - there is no soft delete, no grace period and no export first.

   TWO THINGS GUARD IT, and they guard different mistakes. The dialog
   guards the accidental click: the button here opens a question, not a
   deletion. The password guards the wrong person: an access token proves
   only that this browser was signed in at some point, which an unlocked
   laptop also proves. The server checks the password again regardless -
   nothing here is trusted - so this field is what makes the refusal
   land on the student who mistyped rather than on a stranger who
   guessed nothing.
   ========================================================================== */

function DeleteAccountSection() {
  const { t } = useI18n()
  const { email, forgetSession } = useAuth()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setPassword('')
    setError(null)
  }

  async function handleDelete() {
    setError(null)
    setDeleting(true)

    try {
      await deleteAccount({ currentPassword: password })

      /* forgetSession, not logout: POST /auth/logout raises token_version
         on a user row that no longer exists, so it would be a request
         guaranteed to 401. The tokens are already dead - get_current_user
         cannot find the account they name - and this only clears them
         from the browser.

         replace, so Back does not return to a Settings page belonging to
         an account that is gone. */
      forgetSession()
      navigate('/login', { replace: true })
    } catch (err) {
      /* The dialog stays open and keeps what was typed nowhere - the
         field is cleared by `close()` only. A wrong password is the
         ordinary failure here, and it should cost one retype rather than
         reopening the dialog. */
      setError(getErrorMessage(err, t, 'settings.couldNotDeleteAccount'))
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="type-title">{t('settings.deleteAccountHeading')}</h2>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="type-small text-muted">{t('settings.deleteAccountDescription')}</p>

        <Button variant="danger" onClick={() => setOpen(true)}>
          {t('settings.deleteAccountButton')}
        </Button>
      </CardBody>

      <ConfirmDialog
        open={open}
        title={t('settings.deleteAccountTitle')}
        /* isolate() around the address: it is Latin text inside an Arabic
           sentence, and the sentence's own full stop drifts to the wrong
           end of it without the isolation. */
        description={t('settings.deleteAccountWarning', { email: isolate(email ?? '') })}
        confirmLabel={t('settings.deleteAccountConfirm')}
        busy={deleting}
        /* Nothing typed, nothing to confirm with. */
        confirmDisabled={!password}
        onConfirm={handleDelete}
        onCancel={close}
      >
        <Field label={t('settings.currentPassword')} required hint={t('settings.deleteAccountPasswordHint')}>
          {(field) => (
            <PasswordInput
              {...field}
              /* Takes the opening focus ahead of the confirm button, which
                 Modal would otherwise land on - see ConfirmDialog. */
              data-autofocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setError(null)
                setPassword(event.target.value)
              }}
            />
          )}
        </Field>

        <div className="mt-3">
          <InlineError message={error} />
        </div>
      </ConfirmDialog>
    </Card>
  )
}


/* ==========================================================================
   The counterpart to InlineError
   ========================================================================== */

/* Deliberately the same shape and weight as InlineError, in the accent
   rather than the danger tone. Confirmation belongs on the page next to the
   thing that was saved - an alert() would say it in a box the student has to
   dismiss before they can see whether it is true. */
function SuccessNote({ message }) {
  if (!message) return null

  return (
    <p role="status" className="type-small text-accent">
      {message}
    </p>
  )
}
