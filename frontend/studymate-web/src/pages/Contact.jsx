import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { sendContactMessage } from '../api/contact'
import { getErrorMessage } from '../lib/errors'
import { contentDir } from '../lib/language'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  InlineError,
  Textarea,
} from '../components/ui'

/* ==========================================================================
   Contact us - one message, from a student who is already signed in.

   THE NAME AND THE EMAIL ARE NOT SENT. They are read off the account on the
   server, so a message cannot claim to come from somebody it did not come
   from - which is what makes this form safe with no CAPTCHA and no honeypot
   in front of it.

   They are shown anyway, and shown rather than hidden, because the student
   is about to send a message under their own name and is owed the chance to
   see which name that is and where an answer would go. They are read-only
   because the value comes from the account: an editable box that quietly
   ignores what is typed into it is worse than no box at all.

   WHAT THIS PAGE DOES NOT SAY: when anyone will reply. There is no "within
   24 hours" here and there is no key for one, because that is a promise the
   app has no way to keep. The confirmation says the message was received,
   which is exactly what is known - the row is stored before any email is
   attempted.
   ========================================================================== */

export default function Contact() {
  const { fullName, email } = useAuth()
  const { t, lang } = useI18n()

  const [message, setMessage] = useState('')

  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    setError(null)
    setSent(false)
    setSending(true)

    try {
      await sendContactMessage({ message })

      /* Cleared on success only. A failed send leaves the text exactly
         where it was - the one thing a student cannot get back is what
         they just wrote, and a form that empties itself on an error asks
         them to write it twice. */
      setMessage('')
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err, t, 'contact.couldNotSend'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="no-print space-y-6">
      <header>
        <h1 className="type-display">{t('contact.title')}</h1>
        <p className="type-small mt-1 text-muted">{t('contact.subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="type-title">{t('contact.message')}</h2>
        </CardHeader>

        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* ---- Who this comes from ------------------------------- */}

            {/* `readOnly` and not `disabled`. A disabled field is skipped by
                the keyboard and read out as unavailable, which is the wrong
                thing to say about a value that is perfectly good and simply
                is not edited here. Read-only can still be focused, selected
                and copied. */}
            <Field label={t('contact.fullName')}>
              {(field) => (
                <Input
                  {...field}
                  readOnly
                  autoComplete="name"
                  /* The student's own name, which may be Arabic while the
                     interface is English or the other way round. */
                  dir="auto"
                  value={fullName || ''}
                />
              )}
            </Field>

            <Field label={t('contact.email')} hint={t('contact.fromAccountHint')}>
              {(field) => (
                <Input
                  {...field}
                  readOnly
                  type="email"
                  autoComplete="email"
                  /* An address is Latin whichever language the page is in,
                     and `ltr` rather than `auto` keeps its dots and @ in
                     place inside a right-to-left layout. */
                  dir="ltr"
                  value={email || ''}
                />
              )}
            </Field>

            {/* ---- The only field they fill in ----------------------- */}

            <Field label={t('contact.message')} required>
              {(field) => (
                <Textarea
                  {...field}
                  /* The rule from the i18n batch: this is the student's own
                     content, not our interface. An English message typed
                     into the Arabic interface has to read left to right and
                     an Arabic one right to left, whichever language the app
                     is running in.

                     Not a fixed dir="auto", because that reads the value and
                     ignores the placeholder: an empty box in the Arabic
                     interface would start left-to-right and render the
                     Arabic placeholder with its full stop at the wrong end.
                     contentDir follows the interface language while the box
                     is empty and hands over to "auto" at the first
                     character. */
                  dir={contentDir(message, lang)}
                  rows={8}
                  placeholder={t('contact.messagePlaceholder')}
                  value={message}
                  onChange={(event) => {
                    setSent(false)
                    setMessage(event.target.value)
                  }}
                />
              )}
            </Field>

            {/* ---- What happened ------------------------------------- */}
            {/*
                Both on the page, in the style the rest of the app uses -
                InlineError is the same component every other form reports
                through, and SentNote is the accent-toned counterpart
                Settings uses for a confirmation. No alert() and no
                confirm(): a message in a box that has to be dismissed
                before the page can be read is not an answer.
            */}

            <InlineError message={error} />
            <SentNote message={sent ? t('contact.sent') : null} />

            {/* Full width, following the screenshot. Disabled while the
                request is in flight, so a second click cannot send the
                message twice - and cannot spend one of the five the
                server allows in an hour on a duplicate. */}
            <Button
              type="submit"
              className="w-full"
              loading={sending}
              disabled={!message.trim()}
            >
              {t('contact.send')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

/* ==========================================================================
   The confirmation
   ========================================================================== */

/* The same shape and weight as InlineError, in the accent tone - the
   counterpart Settings.jsx renders after a saved name, written the same way
   here rather than imported, because it is a private piece of that page and
   not one of the shared primitives in components/ui. */
function SentNote({ message }) {
  if (!message) return null

  return (
    <p role="status" className="type-small text-accent">
      {message}
    </p>
  )
}
