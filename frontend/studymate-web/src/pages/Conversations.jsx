import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  deleteConversation,
  listConversations,
  renameConversation,
  setConversationPinned,
} from '../api/conversations'
import { listDocuments } from '../api/documents'
import { useI18n } from '../context/I18nContext'
import { getErrorMessage } from '../lib/errors'
import { sortPinnedFirst } from '../lib/pinned'
import PageHeader from '../components/PageHeader'
import PinButton from '../components/PinButton'
import { ChatIcon, ChevronIcon, DocumentIcon } from '../components/icons'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineError,
  Input,
  LoadingState,
} from '../components/ui'

/* Which document's conversations are being shown lives in the query string,
   not in the path: /conversations/<id> already means one conversation, and a
   second meaning for the same shape would be a trap for anyone reading a URL.
   Quizzes.jsx uses the same parameter for the same reason, so the two pages
   read alike. */
const DOCUMENT_PARAM = 'document'

/* A conversation whose document is not in the documents list - which in
   practice means the list itself failed to load, since deleting a document
   deletes its conversations with it.

   The key rather than the words: this is read while the groups are built, so
   it is resolved there. */
const UNNAMED_DOCUMENT_KEY = 'conversations.untitledDocument'

export default function Conversations() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDocumentId = searchParams.get(DOCUMENT_PARAM) || ''

  const [conversations, setConversations] = useState([])
  const [documentTitles, setDocumentTitles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // The conversation payload carries document_id but no document title,
      // so the documents list is fetched alongside it to label each row - and
      // now to label each card as well.
      const [rows, docs] = await Promise.all([
        listConversations(),
        listDocuments().catch(() => []),
      ])
      setConversations(rows)
      setDocumentTitles(Object.fromEntries(docs.map((doc) => [doc.id, doc.title])))
    } catch (err) {
      setError(getErrorMessage(err, t('conversations.couldNotLoad')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  /* ==========================================================
     Grouping
     ========================================================== */

  /* One group per document that has conversations, rather than one per
     document: a document with no threads has nothing to show here and no way
     to start one from this page - a conversation begins from the document
     itself. That is the whole difference from Quizzes.jsx, which does list
     every document because its create form lives on the page.

     Groups are ordered by their most recent conversation, so the document
     worked on last is the first card. Within a group the rows keep the order
     the server sent: pinned first, then newest first. */
  const groups = useMemo(() => {
    const byDocument = new Map()

    for (const conversation of conversations) {
      const key = String(conversation.documentId ?? '')

      if (!byDocument.has(key)) {
        byDocument.set(key, {
          documentId: key,
          title: documentTitles[conversation.documentId] || t(UNNAMED_DOCUMENT_KEY),
          conversations: [],
          latest: 0,
        })
      }

      const group = byDocument.get(key)
      group.conversations.push(conversation)
      group.latest = Math.max(group.latest, timeOf(conversation.createdAt))
    }

    return [...byDocument.values()].sort((a, b) => b.latest - a.latest)
  }, [conversations, documentTitles, t])

  const selectedGroup = useMemo(
    () => groups.find((group) => group.documentId === selectedDocumentId) || null,
    [groups, selectedDocumentId],
  )

  /* A document id in the URL that no group answers to - the document was
     deleted with its conversations, or the link came from another account.
     Saying so beats an empty list, which looks like a document whose threads
     were all deleted. */
  const unknownDocument =
    Boolean(selectedDocumentId) && !selectedGroup && !loading && !error

  function openDocument(id) {
    setSearchParams({ [DOCUMENT_PARAM]: String(id) })
  }

  function clearDocument() {
    setSearchParams({})
  }

  /* ==========================================================
     Row updates
     ========================================================== */

  function handleRenamed(conversationId, newTitle) {
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId ? { ...item, title: newTitle } : item,
      ),
    )
  }

  /* Updated in place rather than by reloading the list - one field changed and
     the server has confirmed it - but re-sorted so the row actually moves.
     Without the re-sort the icon fills and nothing else happens, which reads
     as a pin that did not take. */
  function handlePinned(conversationId, isPinned) {
    setConversations((current) =>
      sortPinnedFirst(
        current.map((item) =>
          item.id === conversationId ? { ...item, isPinned } : item,
        ),
      ),
    )
  }

  function handleDeleted(deletedId) {
    setConversations((current) => current.filter((item) => item.id !== deletedId))
  }

  /* ==========================================================
     Render
     ========================================================== */

  return (
    <>
      <PageHeader
        eyebrow={t('conversations.eyebrow')}
        title={t('conversations.title')}
        description={t('conversations.description')}
      />

      {loading ? (
        <LoadingState label={t('conversations.loading')} rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : unknownDocument ? (
        <EmptyState
          icon={<DocumentIcon className="h-5 w-5" />}
          title={t('conversations.unknownDocumentTitle')}
          description={t('conversations.unknownDocumentDescription')}
          action={
            <Button variant="secondary" onClick={clearDocument}>
              {t('conversations.allDocumentsButton')}
            </Button>
          }
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<ChatIcon className="h-5 w-5" />}
          title={t('conversations.emptyTitle')}
          description={t('conversations.emptyDescription')}
        />
      ) : selectedGroup ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {/* The document's own title is the student's, so it is dropped
                into the sentence rather than translated with it. */}
            <h2 className="type-eyebrow">
              {t('conversations.aboutDocument', { title: selectedGroup.title })}
            </h2>
            <button
              type="button"
              onClick={clearDocument}
              className="type-small rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              {t('conversations.allDocumentsBack')}
            </button>
          </div>

          {/* The document name is left out of every row here: the heading
              above already says it, and repeating it under each title would
              be the same words all the way down. */}
          <ConversationList
            conversations={selectedGroup.conversations}
            documentTitles={documentTitles}
            showDocument={false}
            onRenamed={handleRenamed}
            onPinned={handlePinned}
            onDeleted={handleDeleted}
          />
        </section>
      ) : (
        <section>
          <h2 className="type-eyebrow mb-3">{t('conversations.yourDocuments')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <DocumentCard
                key={group.documentId}
                title={group.title}
                conversationCount={group.conversations.length}
                onOpen={() => openDocument(group.documentId)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/**
 * One document in the grid, with how many threads it has.
 *
 * Only documents that have conversations get a card. There is nothing to do
 * with an empty one from here - a conversation starts from the document, not
 * from this page - so a card for it would be a dead end.
 */
function DocumentCard({ title, conversationCount, onOpen }) {
  const { t } = useI18n()

  return (
    <Card interactive>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
        >
          <DocumentIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{title}</span>
          <span className="type-micro block text-faint">
            {conversationCount === 1
              ? t('conversations.countOne', { count: conversationCount })
              : t('conversations.countOther', { count: conversationCount })}
          </span>
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
      </button>
    </Card>
  )
}

function ConversationList({
  conversations,
  documentTitles,
  showDocument,
  onRenamed,
  onPinned,
  onDeleted,
}) {
  const { t } = useI18n()

  return (
    <ul className="space-y-2.5">
      {conversations.map((conversation, index) => (
        <li key={conversation.id ?? index}>
          <ConversationRow
            conversation={conversation}
            fallbackTitle={t('conversations.fallbackTitle', { number: index + 1 })}
            documentTitle={documentTitles[conversation.documentId] || null}
            showDocument={showDocument}
            onRenamed={onRenamed}
            onPinned={onPinned}
            onDeleted={onDeleted}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * One conversation: open it, pin it, rename it, or delete it.
 *
 * Renaming swaps the row for an input rather than opening a dialog, the same
 * way a quiz row does: it is one short field, and the row is where the title
 * is being read from.
 */
function ConversationRow({
  conversation,
  fallbackTitle,
  documentTitle,
  showDocument,
  onRenamed,
  onPinned,
  onDeleted,
}) {
  const { t } = useI18n()

  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(conversation.title ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startRenaming() {
    setDraft(conversation.title ?? '')
    setError(null)
    setRenaming(true)
  }

  async function handleSave(event) {
    event.preventDefault()

    const next = draft.trim()

    if (!next) {
      setError(t('conversations.needsTitle'))
      return
    }

    if (next === conversation.title) {
      setRenaming(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await renameConversation(conversation.id, next)
      /* The server has accepted the new title and nothing else about the
         conversation changed, so the row is updated in place instead of
         reloading the whole list. */
      onRenamed(conversation.id, updated.title ?? next)
      setRenaming(false)
    } catch (err) {
      setError(getErrorMessage(err, t('conversations.couldNotRename')))
    } finally {
      setSaving(false)
    }
  }

  if (renaming) {
    return (
      <Card>
        <form onSubmit={handleSave} className="px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={draft}
              aria-label={t('conversations.renameLabel')}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" loading={saving}>
              {t('common.save')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => setRenaming(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {/* In the row, not at the top of the page: the row is what failed. */}
          <InlineError message={error} />
        </form>
      </Card>
    )
  }

  return (
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
              {conversation.title || fallbackTitle}
            </span>
            <span className="type-micro block truncate text-faint">
              {[
                showDocument ? documentTitle : null,
                formatDate(conversation.createdAt),
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </span>
          </span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
        </Link>

        {/* Only for a conversation that has a real id - a row without one
            links to '#' and has nothing the server could pin, rename or
            delete. */}
        {conversation.id ? (
          <>
            <PinButton
              pinned={conversation.isPinned}
              noun="conversation"
              onToggle={async (next) => {
                const updated = await setConversationPinned(conversation.id, next)
                onPinned(conversation.id, updated.isPinned)
              }}
            />

            <div className="shrink-0 text-right">
              <button
                type="button"
                onClick={startRenaming}
                className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                {t('common.rename')}
              </button>
              {error ? <p className="type-micro mt-1 text-danger">{error}</p> : null}
            </div>

            <DeleteConversationButton
              conversation={conversation}
              onDeleted={onDeleted}
            />
          </>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * Delete, in two steps and outside the row's link.
 *
 * Two steps because the whole thread goes with it - every question asked and
 * every answer given, with nothing to undo it. The pin beside it asks nothing,
 * because unpinning costs nothing.
 */
function DeleteConversationButton({ conversation, onDeleted }) {
  const { t } = useI18n()

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
      setError(getErrorMessage(err, t('conversations.couldNotDelete')))
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
          {t('common.delete')}
        </button>
        {error ? <p className="type-micro mt-1 text-danger">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="type-micro text-muted">{t('conversations.confirmDelete')}</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="type-micro rounded-sm px-2 py-1 font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
      >
        {deleting ? t('common.deleting') : t('common.yesDelete')}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={deleting}
        className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-60"
      >
        {t('common.cancel')}
      </button>
    </div>
  )
}

/* Also used by ConversationDetail.jsx for the header date. */
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

/* Sorting the cards needs a number, and a thread with an unreadable date
   sorts last rather than scrambling the cards around it. */
function timeOf(value) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}
