import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getConversation } from '../api/conversations'
import { getErrorMessage } from '../lib/errors'
import { MessageBubble } from './DocumentChat'
import { formatDate } from './Conversations'
import { EmptyState, ErrorState, LoadingState } from '../components/ui'

export default function ConversationDetail() {
  const { id } = useParams()
  const [conversation, setConversation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConversation(await getConversation(id))
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this conversation.'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label="Loading conversation" rows={3} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!conversation) return <EmptyState title="Conversation not found" />

  const messages = conversation.messages || []

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <Link
          to="/conversations"
          className="type-micro font-medium text-muted transition-colors hover:text-ink"
        >
          &larr; All conversations
        </Link>
        <h1 className="type-title mt-1.5">{conversation.title || 'Conversation'}</h1>
        <p className="type-micro mt-1 text-faint">{formatDate(conversation.createdAt)}</p>

        {conversation.documentId ? (
          <Link
            to={`/documents/${conversation.documentId}`}
            className="mt-4 inline-flex h-8 items-center rounded-xs border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-sunken"
          >
            Continue with this document
          </Link>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <EmptyState
          title="No messages in this conversation"
          description="The API returned no messages for this thread."
        />
      ) : (
        <ol className="space-y-5">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ol>
      )}
    </div>
  )
}
