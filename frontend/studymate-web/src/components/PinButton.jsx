import { useState } from 'react'
import { getErrorMessage } from '../lib/errors'
import { useI18n } from '../context/I18nContext'
import { PinIcon } from './icons'
import { cx } from './ui'

/**
 * The pin control that sits in a quiz row and a conversation row.
 *
 * It toggles immediately, with no confirmation: unpinning costs nothing and is
 * undone by clicking again, so a dialog would only be in the way. Compare the
 * delete controls beside it, which do ask - deleting a thread or a set of
 * attempts cannot be undone at all.
 *
 * The icon is filled when pinned and outlined when not, because position on
 * its own cannot say: a pinned row at the top of a short list looks exactly
 * like an unpinned one.
 *
 * `onToggle` is given the state being asked for and must throw if the server
 * refuses. The new state is shown while the request is in flight and dropped
 * again if it fails, so the control ends up back where it started with the
 * reason beside it, rather than claiming a pin the server never stored.
 *
 * `noun` names the kind of row - 'quiz' or 'conversation' - and selects a set
 * of whole sentences rather than being dropped into a shared one. English can
 * build "Pin this quiz" and "Pin this conversation" from one template and two
 * nouns; other languages inflect the rest of the sentence with the noun, so a
 * shared template would be a key that cannot be translated for both. A kind
 * with no sentences written for it shows its key on screen, which is the
 * missing-translation behaviour everywhere else in the app.
 */
export default function PinButton({ pinned, noun, onToggle }) {
  const { t } = useI18n()
  const [requested, setRequested] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const showPinned = requested === null ? Boolean(pinned) : requested

  async function handleClick() {
    const next = !showPinned

    setRequested(next)
    setSaving(true)
    setError(null)

    try {
      await onToggle(next)
    } catch (err) {
      setError(getErrorMessage(err, t(`pin.${next ? 'pinFailed' : 'unpinFailed'}.${noun}`)))
    } finally {
      /* Either the parent has the server's answer in its own state now, or the
         request failed and the control belongs back at the old state. Both are
         the same line. */
      setRequested(null)
      setSaving(false)
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        aria-pressed={showPinned}
        title={showPinned ? t(`pin.unpin.${noun}`) : t(`pin.pinToTop.${noun}`)}
        className={cx(
          'rounded-sm p-1.5 transition-colors disabled:opacity-60',
          showPinned
            ? 'text-accent hover:bg-accent-soft'
            : 'text-muted hover:bg-sunken hover:text-ink',
        )}
      >
        <span className="sr-only">
          {showPinned ? t(`pin.unpin.${noun}`) : t(`pin.pin.${noun}`)}
        </span>
        <PinIcon filled={showPinned} className="h-4 w-4" />
      </button>
      {error ? <p className="type-micro mt-1 text-danger">{error}</p> : null}
    </div>
  )
}
