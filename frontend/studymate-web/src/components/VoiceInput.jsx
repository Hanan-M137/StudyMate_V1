import { useEffect, useRef, useState } from 'react'
import { MicIcon } from './icons'
import { cx } from './ui'

/* ==========================================================================
   VoiceInput - speak into a text field.

   The student types or speaks; both fill the same field, and speaking adds
   to what is already there rather than replacing it. Built against the
   browser's own SpeechRecognition, so there is no backend call, no API key
   and no cost: the paid models in this project answer questions, generate
   quizzes and grade written answers, and dictation is none of those.

   WORTH KNOWING BEFORE YOU TRUST IT: Chrome's implementation is not local.
   It streams the captured audio to Google's servers and returns the
   transcript from there. It is free and it is built into the browser, but
   "we do not send the audio anywhere" is not the same as "the audio never
   leaves the machine", and anyone reading this later should not have to
   discover that for themselves.
   ========================================================================== */

/* Both spellings are in the wild: Chrome and Edge ship the prefixed name,
   the unprefixed one is the standard. Read once, at module load - a browser
   does not acquire the API halfway through a session. */
const SpeechRecognition =
  typeof window === 'undefined'
    ? null
    : window.SpeechRecognition || window.webkitSpeechRecognition

/* ==========================================================================
   Language
   ========================================================================== */

/* A recogniser pointed at the wrong language does not fail - it returns
   fluent nonsense, because it is doing exactly what it was asked. That is
   why this is a visible toggle and not a guess from navigator.language.
   Arabic leads because the documents this project was built against are
   Arabic. */
const LANGUAGES = [
  { code: 'ar-SA', label: 'العربية' },
  { code: 'en-US', label: 'English' },
]

const DEFAULT_LANGUAGE = 'ar-SA'

/* ==========================================================================
   Errors
   ========================================================================== */

/* The spec's error codes, one short sentence each. "not-allowed" tells a
   student nothing, and the raw code in the interface only makes the page
   look broken. */
const ERROR_MESSAGES = {
  'not-allowed':
    'The microphone was blocked. Allow it for this site in your browser, then try again.',
  'service-not-allowed':
    'This browser would not start its speech service. You can type the answer instead.',
  'audio-capture': 'No microphone was found. Connect one, or type instead.',
  'no-speech': 'Nothing was heard. Try again, a little closer to the microphone.',
  network: 'Speech recognition needs a connection, and this request did not get through.',
}

const FALLBACK_ERROR = 'The microphone stopped unexpectedly. You can type instead.'

/**
 * A microphone and a language toggle for one text field.
 *
 * @param value    the field's current text - read when appending, so that a
 *                 word spoken after some typing keeps the typing
 * @param onChange called with the whole new value, exactly as the field's
 *                 own onChange would be
 */
export default function VoiceInput({ value, onChange, className }) {
  const [listening, setListening] = useState(false)
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)

  /* The result handler outlives the render that created it, so it reaches
     the field through refs. Reading `value` from the closure instead would
     append to the text as it was when listening started, silently throwing
     away anything typed while the microphone was on. */
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  }, [value, onChange])

  /* A recogniser left running after the form is gone keeps the browser's
     recording indicator lit and keeps listening to the room. The handlers
     are cleared first so the abort cannot call setState on the way out. */
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current
      if (!recognition) return

      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [])

  /* ======================================================================
     Committing what was heard
     ====================================================================== */

  function appendTranscript(text) {
    const spoken = text.trim()
    if (spoken === '') return

    const current = String(valueRef.current ?? '')

    /* Append, never replace, with exactly one space at the seam: the
       student may have typed half of this already, and the recogniser
       returns its phrases without any leading or trailing space. */
    const next = current.trim() === '' ? spoken : `${current.replace(/\s+$/u, '')} ${spoken}`

    onChangeRef.current?.(next)
  }

  /* ======================================================================
     Starting and stopping
     ====================================================================== */

  function stopListening() {
    recognitionRef.current?.stop()
  }

  function startListening() {
    setError(null)
    setInterim('')

    const recognition = new SpeechRecognition()

    /* `lang` is read when the recogniser starts, which is also why the
       language toggle is locked while it is running. */
    recognition.lang = language
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      let pending = ''

      /* From resultIndex, not from zero: with `continuous` on, phrases
         already committed stay in the list, and re-reading them from the
         start would append every one of them a second time. */
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]

        if (result.isFinal) finalText += result[0].transcript
        else pending += result[0].transcript
      }

      /* Interim text is shown but never committed: the recogniser revises
         it freely until it settles, and only the final transcript is what
         the student actually said. */
      setInterim(pending)

      if (finalText) appendTranscript(finalText)
    }

    recognition.onerror = (event) => {
      /* `aborted` is this component unmounting or stopping the recogniser
         itself - our own doing, and not something to report. */
      if (event.error === 'aborted') return

      setError(ERROR_MESSAGES[event.error] || FALLBACK_ERROR)
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
      recognitionRef.current = null
    }

    recognitionRef.current = recognition

    /* start() throws if a recogniser is somehow already running, and an
       uncaught throw out of a click handler would take the form down. */
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setError('The microphone could not be started. Try again in a moment.')
      return
    }

    setListening(true)
  }

  /* ======================================================================
     Render
     ====================================================================== */

  /* Firefox and Safari do not implement this API at all. A microphone that
     does nothing when it is clicked is worse than no microphone, so in
     those browsers there is simply nothing here. */
  if (!SpeechRecognition) return null

  return (
    <div className={cx('w-full sm:w-44', className)}>
      <button
        type="button"
        onClick={listening ? stopListening : startListening}
        aria-pressed={listening}
        className={cx(
          'inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm border px-3',
          'text-[0.8125rem] font-medium transition-colors duration-150',
          /* Listening changes both the word and the colour. Whether the
             microphone is on is the one thing here that must never be
             ambiguous, so it is not left to a single cue. */
          listening
            ? 'border-danger bg-danger-soft text-danger'
            : 'border-accent bg-accent text-on-accent hover:bg-accent-hover',
        )}
      >
        <MicIcon className="h-4 w-4" />
        {listening ? 'Stop listening' : 'Speak'}
      </button>

      <div
        role="group"
        aria-label="Speech recognition language"
        className="mt-2 flex overflow-hidden rounded-sm border border-line-strong"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            disabled={listening}
            aria-pressed={language === option.code}
            onClick={() => setLanguage(option.code)}
            className={cx(
              'type-micro flex-1 px-2 py-1.5 font-medium transition-colors duration-150',
              language === option.code
                ? 'bg-accent-soft text-accent'
                : 'text-muted hover:bg-sunken hover:text-ink',
              listening && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {interim ? (
        <p className="type-micro mt-1.5 text-faint" aria-live="polite">
          {interim}
        </p>
      ) : null}

      {/* Beside the field, never as a page-level error: a refused microphone
          has not broken anything the student was doing, and the form is
          still perfectly usable by typing. */}
      {error ? (
        <p className="type-micro mt-1.5 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
