import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getDocument, isPending, isReady } from '../api/documents'
import { getConversation } from '../api/conversations'
import { sendChatMessage } from '../api/chat'
import { getErrorMessage } from '../lib/errors'
import SourceList from '../components/SourceList'
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

const PROMPT_IDEAS = [
  'Summarise the key points of section 1',
  'Explain this in simpler terms',
  'What are the main figures mentioned?',
]

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export default function DocumentChat() {
  const { id: documentId } = useParams()

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
          setSendError('That conversation belongs to a different document.')
          return
        }

        setConversationId(conversation.id)
        setMessages(conversation.messages)
      })
      .catch((err) => {
        if (!cancelled) {
          setSendError(getErrorMessage(err, 'Could not load that conversation.'))
        }
      })
      .finally(() => {
        if (!cancelled) setResuming(false)
      })

    return () => {
      cancelled = true
    }
  }, [documentId, resumeId])

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      setDoc(await getDocument(documentId))
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load this document.'))
    } finally {
      setLoading(false)
    }
  }, [documentId])

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
      setSendError(getErrorMessage(err, 'The assistant could not answer.'))
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

  if (loading) return <LoadingState label="Loading document" rows={2} />
  if (loadError) return <ErrorState message={loadError} onRetry={load} />
  if (!doc) return <EmptyState title="Document not found" />

  const ready = isReady(doc.status)

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0 flex-1">
          <Link
            to="/documents"
            className="type-micro font-medium text-muted transition-colors hover:text-ink"
          >
            &larr; All documents
          </Link>
          <h1 className="type-title mt-1.5 truncate">{doc.title}</h1>
          <p className="type-micro truncate text-faint">{doc.filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={ready ? 'accent' : 'pending'} dot>
            {ready ? 'Ready' : doc.status}
          </Badge>
          {messages.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={startNewConversation}>
              New thread
            </Button>
          ) : null}
        </div>
      </header>

      {!ready ? (
        <div className="mb-5 rounded-lg border border-pending-line bg-pending-soft px-4 py-3.5">
          <p className="text-sm font-semibold text-pending">Still indexing</p>
          <p className="type-small mt-1 text-pending/90">
            Chat opens as soon as this document finishes processing. The status above refreshes on
            its own.
          </p>
        </div>
      ) : null}

      <div className="flex-1">
        {resuming ? (
          <LoadingState label="Loading conversation" rows={2} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<ChatIcon className="h-5 w-5" />}
            title="Ask your first question"
            description="Answers are drawn only from this document and cite the page they came from."
            action={
              ready ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {PROMPT_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => send(idea)}
                      className="type-small rounded-full border border-line bg-surface px-3.5 py-1.5 text-ink-soft transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent"
                    >
                      {idea}
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
          <ErrorState message={sendError} title="Message not sent" />
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
        className="sticky bottom-0 mt-5 flex gap-2 border-t border-line bg-paper/95 py-4 backdrop-blur"
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask about this document
        </label>
        <Input
          id="chat-input"
          ref={inputRef}
          value={draft}
          disabled={!ready || sending || resuming}
          placeholder={ready ? 'Ask about this document...' : 'Waiting for processing...'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          disabled={!ready || sending || resuming || !draft.trim()}
          loading={sending}
        >
          Send
        </Button>
      </form>
    </div>
  )
}

export function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <li className="animate-enter flex justify-end">
        <div className="measure rounded-lg rounded-br-xs bg-accent px-4 py-2.5 text-on-accent">
          <p className="type-body whitespace-pre-line">{message.content}</p>
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
        <p className="type-body whitespace-pre-line text-ink">
          {message.content || <em className="text-muted">(empty answer)</em>}
        </p>

        <SourceList sources={message.sources} />
      </Card>
    </li>
  )
}

function TypingIndicator() {
  return (
    <li className="flex gap-3" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <SparkIcon className="h-4 w-4" />
      </span>
      <Card className="px-4 py-3.5">
        <span className="sr-only">Searching your document</span>
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