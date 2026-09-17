import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getDocument, isPending, isReady } from '../api/documents'
import { getConversation } from '../api/conversations'
import { sendChatMessage } from '../api/chat'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import { contentDir } from '../lib/language'
import SourceList from '../components/SourceList'
import VoiceInput from '../components/VoiceInput'
import { ChatIcon, SparkIcon } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  cx,
} from '../components/ui'

/* Keys rather than the sentences themselves: the list is built out here,
   where a hook cannot run, and each one is resolved as it is rendered - and
   again as it is sent, because tapping one sends it as the question. */
const PROMPT_IDEA_KEYS = ['chat.ideaSummarise', 'chat.ideaSimpler', 'chat.ideaFigures']

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export default function DocumentChat() {
  const { id: documentId } = useParams()
  const { t, lang } = useI18n()

  /* A ?conversation= parameter means an existing thread is being reopened from
     the conversations list. Without it this page starts a new thread, which is
     what it always did. */
  const [searchParams, setSearchParams] = useSearchParams()
  const resumeId = searchParams.get('conversation')

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  /* The first message omits conversation_id; the server returns one and every
     following message in this thread reuses it. When a thread is resumed the
     id comes from the URL instead, and its stored messages are loaded below.

     IMPORTANT: the backend rejects a conversation_id belonging to a different
     document with 404, so this state must be cleared whenever documentId
     changes - React Router keeps this component mounted when you navigate from
     /documents/A to /documents/B. */
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [sendError, setSendError] = useState(null)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  /* Resetting on documentId alone is not enough. React Router keeps this
     component mounted across navigations, so the thread being resumed has to
     be part of the dependency list too, or arriving from a conversation link
     would clear the very state this effect is meant to fill.

     `cancelled` guards the async load: navigating again while a conversation
     is still loading must not let the stale response overwrite the new one. */
  useEffect(() => {
    let cancelled = false

    setConversationId(null)
    setMessages([])
    setDraft('')
    setSendError(null)

    if (!resumeId) return undefined

    setResuming(true)

    getConversation(resumeId)
      .then((conversation) => {
        if (cancelled) return

        // A thread belongs to exactly one document and the backend answers 404
        // when the two disagree, so the mismatch is caught here rather than
        // sent and failed.
        if (
          conversation.documentId &&
          String(conversation.documentId) !== String(documentId)
        ) {
          setSendError(t('chat.wrongDocument'))
          return
        }

        setConversationId(conversation.id)
        setMessages(conversation.messages)
      })
      .catch((err) => {
        if (!cancelled) {
          setSendError(getErrorMessage(err, t, 'chat.couldNotLoadConversation'))
        }
      })
      .finally(() => {
        if (!cancelled) setResuming(false)
      })

    return () => {
      cancelled = true
    }
  }, [documentId, resumeId, t])

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      setDoc(await getDocument(documentId))
    } catch (err) {
      setLoadError(getErrorMessage(err, t, 'chat.couldNotLoadDocument'))
    } finally {
      setLoading(false)
    }
  }, [documentId, t])

  useEffect(() => {
    load()
  }, [load])

  // Keep polling while the document is still being processed (pending -> ready).
  const status = doc?.status
  useEffect(() => {
    if (!status || !isPending(status)) return undefined
    const timer = setInterval(async () => {
      try {
        setDoc(await getDocument(documentId))
      } catch {
        /* transient - the next tick tries again */
      }
    }, 4000)
    return () => clearInterval(timer)
  }, [status, documentId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [messages, sending])

  async function send(text) {
    const message = text.trim()
    if (!message || sending || resuming) return

    setSendError(null)
    setSending(true)
    setDraft('')
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: 'user', content: message, sources: [] },
    ])

    try {
      const response = await sendChatMessage({ documentId, message, conversationId })
      if (response.conversationId) setConversationId(response.conversationId)
      setMessages((current) => [
        ...current,
        {
          id: `answer-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          sources: response.sources,
        },
      ])
    } catch (err) {
      setSendError(getErrorMessage(err, t, 'chat.couldNotAnswer'))
      setDraft(message)
      setMessages((current) => current.slice(0, -1))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function startNewConversation() {
    setConversationId(null)
    setMessages([])
    setSendError(null)
    // Leave the resumed thread behind, or a page refresh would reopen it.
    if (resumeId) setSearchParams({}, { replace: true })
    inputRef.current?.focus()
  }

  if (loading) return <LoadingState label={t('chat.loadingDocument')} rows={2} />
  if (loadError) return <ErrorState message={loadError} onRetry={load} />
  if (!doc) return <EmptyState title={t('chat.documentNotFound')} />

  const ready = isReady(doc.status)

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0 flex-1">
          <Link
            to="/documents"
            className="type-micro font-medium text-muted transition-colors hover:text-ink"
          >
            {/* The arrow is an element of its own rather than a character
                inside the sentence, so a right-to-left layout can mirror it
                without mirroring the words beside it. */}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              ←
            </span>{' '}
            {t('chat.allDocuments')}
          </Link>
          <h1 dir="auto" className="type-title mt-1.5 truncate">
            {doc.title}
          </h1>
          <p dir="auto" className="type-micro truncate text-faint">
            {doc.filename}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* The pending side is the server's own word for the state, shown
              as it arrived; only "Ready" is ours to say. */}
          <Badge tone={ready ? 'accent' : 'pending'} dot>
            {ready ? t('documents.statusReady') : doc.status}
          </Badge>
          {messages.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={startNewConversation}>
              {t('chat.newThread')}
            </Button>
          ) : null}
        </div>
      </header>

      {!ready ? (
        <div className="mb-5 rounded-lg border border-pending-line bg-pending-soft px-4 py-3.5">
          <p className="text-sm font-semibold text-pending">{t('chat.stillIndexing')}</p>
          <p className="type-small mt-1 text-pending/90">{t('chat.stillIndexingBody')}</p>
        </div>
      ) : null}

      <div className="flex-1">
        {resuming ? (
          <LoadingState label={t('conversations.loadingOne')} rows={2} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<ChatIcon className="h-5 w-5" />}
            title={t('chat.emptyTitle')}
            description={t('chat.emptyDescription')}
            action={
              ready ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {PROMPT_IDEA_KEYS.map((ideaKey) => (
                    <button
                      key={ideaKey}
                      type="button"
                      onClick={() => send(t(ideaKey))}
                      className="type-small rounded-full border border-line bg-surface px-3.5 py-1.5 text-ink-soft transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                    >
                      {t(ideaKey)}
                    </button>
                  ))}
                </div>
              ) : null
            }
          />
        ) : (
          <ol className="space-y-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {sending ? <TypingIndicator /> : null}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError ? (
        <div className="mt-5">
          <ErrorState message={sendError} title={t('chat.messageNotSent')} />
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
        className="sticky bottom-0 mt-5 flex items-start gap-2 border-t border-line bg-paper/95 py-4 backdrop-blur"
      >
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.inputLabel')}
        </label>
        {/* The question is the student's own writing, in whichever
            language they are reading the document in.

            Not a fixed dir="auto", because that reads the value and ignores
            the placeholder: this box is empty on every page load and again
            after every message sent, so in the Arabic interface it would
            start left-to-right and render the Arabic placeholder with its
            full stop at the wrong end. contentDir follows the interface
            language while the box is empty and hands over to "auto" at the
            first character. */}
        <Input
          id="chat-input"
          ref={inputRef}
          dir={contentDir(draft, lang)}
          className="min-w-0 flex-1"
          value={draft}
          disabled={!ready || sending || resuming}
          placeholder={
            ready ? t('chat.inputPlaceholder') : t('chat.inputPlaceholderWaiting')
          }
          onChange={(event) => setDraft(event.target.value)}
        />

        {/* Between the field and Send, not inside the field. A control inside
            a text input has to be positioned over text the student is still
            editing, and this one is two controls and sometimes an error
            message - it does not fit there.

            It appends to the draft rather than replacing it, so a question
            half typed and half spoken comes out whole. In Firefox and Safari
            the component renders nothing at all: there is no SpeechRecognition
            to drive it, and a microphone that does nothing when clicked is
            worse than no microphone.

            The wrapper carries the width rather than a prop: VoiceInput's own
            root is `w-full sm:w-44`, so inside a sized box it fills the box on
            a phone and keeps its natural width from `sm` up. That leaves the
            component itself untouched - same behaviour, same markup. */}
        <div className="no-print w-36 shrink-0 sm:w-44">
          <VoiceInput value={draft} onChange={setDraft} />
        </div>

        <Button
          type="submit"
          disabled={!ready || sending || resuming || !draft.trim()}
          loading={sending}
        >
          {t('chat.send')}
        </Button>
      </form>
    </div>
  )
}

export function MessageBubble({ message }) {
  const { t } = useI18n()

  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <li className="animate-enter flex justify-end">
        <div className="measure rounded-lg rounded-ee-xs bg-accent px-4 py-2.5 text-on-accent">
          <p dir="auto" className="type-body whitespace-pre-line">
            {message.content}
          </p>
        </div>
      </li>
    )
  }

  return (
    <li className="animate-enter flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <SparkIcon className="h-4 w-4" />
      </span>
      <Card className="measure min-w-0 flex-1 px-4 py-3.5">
        {/* The answer is written in the language of the document, which is
            not necessarily the language of the interface around it. */}
        <p dir="auto" className="type-body whitespace-pre-line text-ink">
          {message.content || <em className="text-muted">{t('chat.emptyAnswer')}</em>}
        </p>

        <SourceList sources={message.sources} />
      </Card>
    </li>
  )
}

function TypingIndicator() {
  const { t } = useI18n()

  return (
    <li className="flex gap-3" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <SparkIcon className="h-4 w-4" />
      </span>
      <Card className="px-4 py-3.5">
        <span className="sr-only">{t('chat.searching')}</span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cx('h-1.5 w-1.5 rounded-full bg-accent')}
              style={{ animation: `sm-blink 1.1s ${index * 0.16}s infinite ease-in-out` }}
            />
          ))}
        </span>
      </Card>
    </li>
  )
}