import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteDocument,
  getDocument,
  isFailed,
  isPending,
  isReady,
  listDocuments,
  renameDocument,
  uploadDocument,
} from '../api/documents'
import { getErrorMessage } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import UploadDropzone from '../components/UploadDropzone'
import { ChatIcon, DocumentIcon } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Spinner,
  cx,
} from '../components/ui'

const POLL_INTERVAL_MS = 4000

export default function Documents() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [uploadError, setUploadError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [rowError, setRowError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setDocuments(await listDocuments())
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your documents.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /* Uploads are processed by a background task, so the status returned by
     POST /documents is not final. Re-fetch each unfinished document until it
     is ready or failed. */
  const pendingIds = documents.filter((doc) => isPending(doc.status)).map((doc) => doc.id)
  const pendingKey = pendingIds.join(',')

  useEffect(() => {
    if (!pendingKey) return undefined
    let cancelled = false

    const timer = setInterval(async () => {
      const ids = pendingKey.split(',')
      const updates = await Promise.all(ids.map((id) => getDocument(id).catch(() => null)))
      if (cancelled) return
      const byId = new Map(updates.filter(Boolean).map((doc) => [doc.id, doc]))
      if (byId.size === 0) return
      setDocuments((current) => current.map((doc) => byId.get(doc.id) || doc))
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pendingKey])

  async function handleUpload(file) {
    setUploadError(null)

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files can be uploaded.')
      return
    }

    setUploading(true)
    setProgress(0)
    try {
      const created = await uploadDocument(file, (event) => {
        if (event.total) setProgress(Math.round((event.loaded / event.total) * 100))
      })
      setDocuments((current) => [created, ...current.filter((doc) => doc.id !== created.id)])
    } catch (err) {
      setUploadError(getErrorMessage(err, 'Upload failed.'))
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function handleRename(documentId, title) {
    setRowError(null)
    try {
      const updated = await renameDocument(documentId, title)
      setDocuments((current) => current.map((doc) => (doc.id === documentId ? updated : doc)))
    } catch (err) {
      setRowError(getErrorMessage(err, 'Could not rename the document.'))
      throw err
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setRowError(null)
    try {
      await deleteDocument(pendingDelete.id)
      setDocuments((current) => current.filter((doc) => doc.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch (err) {
      setRowError(getErrorMessage(err, 'Could not delete the document.'))
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const readyCount = documents.filter((doc) => isReady(doc.status)).length

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Upload a PDF, wait for it to be indexed, then chat with it or turn it into a quiz."
      />

      <div className="space-y-6">
        <div className="space-y-3">
          <UploadDropzone onFile={handleUpload} uploading={uploading} progress={progress} />
          {uploadError ? <ErrorState title="Upload failed" message={uploadError} /> : null}
        </div>

        {rowError ? <ErrorState message={rowError} /> : null}

        {loading ? (
          <LoadingState label="Loading your documents" rows={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<DocumentIcon className="h-5 w-5" />}
            title="No documents yet"
            description="Drop your first lecture notes or textbook chapter above. Processing usually takes a few seconds."
          />
        ) : (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="type-eyebrow">
                {documents.length} {documents.length === 1 ? 'document' : 'documents'}
              </h2>
              {readyCount < documents.length ? (
                <span className="type-micro text-muted">
                  {documents.length - readyCount} still processing
                </span>
              ) : null}
            </div>
            <ul className="space-y-2.5">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  onRename={handleRename}
                  onRequestDelete={() => setPendingDelete(doc)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this document?"
        description={`"${pendingDelete?.title ?? ''}" will be removed, along with its conversations and quizzes. This cannot be undone.`}
        confirmLabel="Delete document"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}

function DocumentRow({ doc, onRename, onRequestDelete }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(doc.title)
  }, [doc.title])

  const ready = isReady(doc.status)
  const failed = isFailed(doc.status)

  async function save(event) {
    event.preventDefault()
    const next = title.trim()
    if (!next || next === doc.title) {
      setEditing(false)
      setTitle(doc.title)
      return
    }
    setSaving(true)
    try {
      await onRename(doc.id, next)
      setEditing(false)
    } catch {
      /* the parent surfaces the message */
    } finally {
      setSaving(false)
    }
  }

  return (
    <li>
      <Card className="px-4 py-3.5 sm:px-5">
        {editing ? (
          <form onSubmit={save} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`rename-${doc.id}`} className="sr-only">
              Document title
            </label>
            <Input
              id={`rename-${doc.id}`}
              value={title}
              autoFocus
              className="min-w-40 flex-1"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setEditing(false)
                  setTitle(doc.title)
                }
              }}
            />
            <Button type="submit" size="sm" loading={saving}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setTitle(doc.title)
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <span
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm',
                ready ? 'bg-accent-soft text-accent' : 'bg-sunken text-muted',
              )}
              aria-hidden="true"
            >
              <DocumentIcon className="h-[18px] w-[18px]" />
            </span>

            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
              <p className="type-micro truncate text-faint">{doc.filename}</p>
            </div>

            <StatusBadge status={doc.status} />

            <div className="flex items-center gap-1">
              {ready ? (
                <Link
                  to={`/documents/${doc.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xs bg-accent px-3 text-[0.8125rem] font-medium text-on-accent transition-colors hover:bg-accent-hover"
                >
                  <ChatIcon className="h-4 w-4" />
                  Chat
                </Link>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={onRequestDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        )}

        {!editing && failed ? (
          <p className="type-small mt-3 rounded-xs bg-danger-soft px-3 py-2 text-danger">
            Processing failed on the server. Delete this document and upload the PDF again.
          </p>
        ) : null}

        {!editing && !ready && !failed ? (
          <p className="type-small mt-3 flex items-center gap-2 rounded-xs bg-pending-soft px-3 py-2 text-pending">
            <Spinner className="h-3.5 w-3.5" />
            Indexing in the background. This list refreshes every few seconds.
          </p>
        ) : null}
      </Card>
    </li>
  )
}

function StatusBadge({ status }) {
  if (isReady(status)) {
    return (
      <Badge tone="accent" dot>
        Ready
      </Badge>
    )
  }
  if (isFailed(status)) {
    return (
      <Badge tone="danger" dot>
        Failed
      </Badge>
    )
  }
  return (
    <Badge tone="pending" dot>
      {status || 'Pending'}
    </Badge>
  )
}
