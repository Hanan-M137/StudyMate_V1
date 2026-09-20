import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { resendVerification } from '../api/auth'
import { getErrorMessage } from '../lib/errors'
import {
  VERIFICATION_CODE_LENGTH,
  normalizeVerificationCode,
} from '../lib/verificationCode'
import { Button, Field, Input, InlineError } from './ui'

/* ==========================================================================
   The code field, the Verify button and the Resend link.

   ONE COMPONENT IN TWO PLACES, which is why it is here and not inside a
   page. Registration ends here, and so does a sign-in that came back 403
   because the address was never verified. Those are the same three controls
   doing the same job, and a second copy on the login page would be the one
   that stopped being fixed.

   IT SIGNS THE STUDENT IN ITSELF. verifyEmail() answers with the same token
   pair login answers with, and AuthContext stores it exactly as it stores a
   login's - so a verified student is inside the app, not back at a form
   asking for the password they typed ninety seconds ago. The page says where
   to go next through onVerified.
   ========================================================================== */

export default function VerifyEmailPanel({ email, onVerified }) {
  const { verifyEmail } = useAuth()
  const { t } = useI18n()

  const [code, setCode] = useState('')

  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState(null)
  const [resent, setResent] = useState(false)

  async function handleVerify(event) {
    event.preventDefault()

    setError(null)
    setResent(false)
    setVerifying(true)

    try {
      await verifyEmail({ email, code })
      onVerified()
    } catch (err) {
      setError(getErrorMessage(err, t, 'auth.couldNotVerify'))
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setError(null)
    setResent(false)
    setResending(true)

    try {
      await resendVerification({ email })

      /* Cleared, because the code in the box is the old one and the old one
         has just been invalidated on the server. Leaving it there would
         invite the student to press Verify on a code that is now certain to
         be refused. */
      setCode('')
      setResent(true)
    } catch (err) {
      /* The 429 is the only thing this can throw that means anything -
         everything else answers 200 on purpose. */
      setError(getErrorMessage(err, t, 'auth.couldNotResend'))
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4" noValidate>
      {/* ---- Which address the code went to ----------------------------- */}

      {/* The address is its own element and is NOT interpolated into the
          sentence above it. An email is Latin text, the sentence next to it
          may be Arabic, and a right-to-left line that ends in an address
          reorders it: the domain moves in front of the name and the full
          stop lands at the wrong end. On its own line with dir="ltr" it is
          simply correct in both languages. */}
      <p className="type-small text-muted">
        {t('auth.verifySentTo')}
        <span dir="ltr" className="mt-0.5 block font-medium text-ink">
          {email}
        </span>
      </p>

      {/* ---- The code --------------------------------------------------- */}

      <Field label={t('auth.verificationCode')} required hint={t('auth.verificationCodeHint')}>
        {(field) => (
          <Input
            {...field}
            /* numeric rather than tel: the phone keypad without the
               brackets and plus signs a telephone keyboard carries. */
            inputMode="numeric"
            /* Lets a phone offer the code straight out of the message it
               just arrived in, which is the one case where nobody has to
               type it at all. */
            autoComplete="one-time-code"
            /* Digits read left to right in both interfaces. */
            dir="ltr"
            maxLength={VERIFICATION_CODE_LENGTH}
            className="text-center text-lg tracking-[0.4em]"
            value={code}
            /* Normalised on every change rather than on submit, so a pasted
               code loses its stray spaces in front of the student instead of
               being refused later, and Arabic-Indic digits become the Latin
               ones the email showed. */
            onChange={(event) => {
              setResent(false)
              setCode(normalizeVerificationCode(event.target.value))
            }}
          />
        )}
      </Field>

      {/* ---- What happened ---------------------------------------------- */}

      <InlineError message={error} />

      {resent ? (
        <p role="status" className="type-small text-accent">
          {t('auth.verifyResent')}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={verifying}
        /* Nothing to send until all six are there. The server would refuse a
           short code with the same sentence it refuses a wrong one, and
           spending one of five attempts on a half-typed code would be this
           page's fault rather than the student's. */
        disabled={code.length < VERIFICATION_CODE_LENGTH}
      >
        {t('auth.verify')}
      </Button>

      {/* ---- The way out of a code that never came ---------------------- */}

      <div className="flex flex-wrap items-center justify-center gap-1">
        <span className="type-small text-muted">{t('auth.noCodeYet')}</span>

        <Button
          variant="quiet"
          size="sm"
          onClick={handleResend}
          loading={resending}
          disabled={verifying}
        >
          {t('auth.sendNewCode')}
        </Button>
      </div>
    </form>
  )
}
