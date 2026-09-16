import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getConversation } from '../api/conversations'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import { MessageBubble } from './DocumentChat'
import { formatDate } from './Conversations'
import { EmptyState, ErrorState, LoadingState } from '../components/ui'

export default function ConversationDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const [conversation, setConversation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConversation(await getConversation(id))
    } catch (err) {
      setError(getErrorMessage(err, t('conversations.couldNotLoadDetail')))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label={t('conversations.loadingOne')} rows={3} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!conversation) return <EmptyState title={t('conversations.notFound')} />

  const messages = conversation.messages || []

  return (
    <div>
      <header className="mb-6 border-b border-line pb-5">
        <Link
          to="/conversations"
          className="type-micro font-medium text-muted transition-colors hover:text-ink"
        >
          {t('conversations.allConversations')}
        </Link>
        <h1 className="type-title mt-1.5">
          {conversation.title || t('conversations.untitled')}
        </h1>
        <p className="type-micro mt-1 text-faint">{formatDate(conversation.createdAt)}</p>

        {/* The conversation id travels in the query string so the chat page can
            reopen THIS thread rather than starting a new one on the same
            document, which is what this button used to do. */}
        {conversation.documentId ? (
          <Link
            to={`/documents/${conversation.documentId}?conversation=${conversation.id}`}
            className="mt-4 inline-flex h-8 items-center rounded-xs border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-sunken"
          >
            {t('conversations.continue')}
          </Link>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <EmptyState
          title={t('conversations.noMessagesTitle')}
          description={t('conversations.noMessagesDescription')}
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