import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteConversation, listConversations } from '../api/conversations'
import { listDocuments } from '../api/documents'
import { getErrorMessage } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import { ChatIcon, ChevronIcon } from '../components/icons'
import { Card, EmptyState, ErrorState, LoadingState } from '../components/ui'

export default function Conversations() {
  const [conversations, setConversations] = useState([])
  const [documentTitles, setDocumentTitles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // The conversation payload carries document_id but no document title,
      // so the documents list is fetched alongside it to label each row.
      const [rows, docs] = await Promise.all([
        listConversations(),
        listDocuments().catch(() => []),
      ])
      setConversations(rows)
      setDocumentTitles(Object.fromEntries(docs.map((doc) => [doc.id, doc.title])))
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your conversations.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Conversations"
        description="Every thread you have started with a document. Each one is titled with the first question you asked."
      />

      {loading ? (
        <LoadingState label="Loading conversations" rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<ChatIcon className="h-5 w-5" />}
          title="No conversations yet"
          description="Open a document that has finished processing and ask a question to start one."
        />
      ) : (
        <ul className="space-y-2.5">
          {conversations.map((conversation, index) => (
            <li key={conversation.id ?? index}>
              <Card interactive className="transition-colors">
                <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <Link
                    to={conversation.id ? `/conversations/${conversation.id}` : '#'}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
                    >
                      <ChatIcon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {conversation.title || `Conversation ${index + 1}`}
                      </span>
                      <span className="type-micro block truncate text-faint">
                        {[
                          documentTitles[conversation.documentId] || null,
                          formatDate(conversation.createdAt),
                        ]
                          .filter(Boolean)
                          .join('  ·  ')}
                      </span>
                    </span>
                    <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
                  </Link>

                  {/* Only for a conversation that has a real id - a row without
                      one links to '#' and has nothing the server could delete. */}
                  {conversation.id ? (
                    <DeleteConversationButton
                      conversation={conversation}
                      onDeleted={(deletedId) =>
                        setConversations((current) =>
                          current.filter((item) => item.id !== deletedId),
                        )
                      }
                    />
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Delete, in two steps and outside the row's link.
 *
 * Two steps because the whole thread goes with it - every question asked and
 * every answer given, with nothing to undo it.
 */
function DeleteConversationButton({ conversation, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      await deleteConversation(conversation.id)
      onDeleted(conversation.id)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete this conversation.'))
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <div className="shrink-0 text-right">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-danger"
        >
          Delete
        </button>
        {error ? <p className="type-micro mt-1 text-danger">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="type-micro text-muted">Delete this thread and its messages?</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="type-micro rounded-sm px-2 py-1 font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
      >
        {deleting ? 'Deleting...' : 'Yes, delete'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={deleting}
        className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  )
}

export function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}