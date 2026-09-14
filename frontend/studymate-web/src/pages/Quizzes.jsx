import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listDocuments, isReady } from '../api/documents'
import { createQuiz, deleteQuiz, listQuizzes } from '../api/quizzes'
import { getErrorMessage } from '../lib/errors'
import PageHeader from '../components/PageHeader'
import { ChevronIcon, QuizIcon } from '../components/icons'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingState,
  Select,
} from '../components/ui'

export default function Quizzes() {
  const navigate = useNavigate()

  const [documents, setDocuments] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [documentId, setDocumentId] = useState('')
  const [title, setTitle] = useState('')
  const [numQuestions, setNumQuestions] = useState(10)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [docs, savedQuizzes] = await Promise.all([listDocuments(), listQuizzes()])
      setDocuments(docs)
      setQuizzes(savedQuizzes)
      const firstReady = docs.find((doc) => isReady(doc.status))
      if (firstReady) setDocumentId((current) => current || firstReady.id)
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load your quizzes.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(event) {
    event.preventDefault()
    setCreateError(null)

    if (!documentId) {
      setCreateError('Pick a document first.')
      return
    }
    if (!title.trim()) {
      setCreateError('Give the quiz a title.')
      return
    }

    setCreating(true)
    try {
      const quiz = await createQuiz({ documentId, title: title.trim(), numQuestions })
      if (quiz.id) {
        navigate(`/quizzes/${quiz.id}`)
      } else {
        setCreateError(
          'The quiz was created but the response contained no quiz_id, so it cannot be opened.',
        )
      }
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Could not create the quiz.'))
    } finally {
      setCreating(false)
    }
  }

  const readyDocuments = documents.filter((doc) => isReady(doc.status))

  return (
    <>
      <PageHeader
        eyebrow="Revision"
        title="Quizzes"
        description="Generate a quiz from a document you have already uploaded, then take it."
      />

      <div className="space-y-8">
        {loading ? (
          <LoadingState label="Loading your quizzes" rows={2} />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : readyDocuments.length === 0 ? (
          <EmptyState
            icon={<QuizIcon className="h-5 w-5" />}
            title="No processed documents"
            description="A quiz is generated from a document, so upload a PDF and wait for it to finish indexing first."
            action={
              <Link
                to="/documents"
                className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                Go to documents
              </Link>
            }
          />
        ) : (
          <Card as="form" onSubmit={handleCreate}>
            <CardBody className="space-y-4">
              <Field label="Document" required>
                {(field) => (
                  <Select
                    {...field}
                    value={documentId}
                    onChange={(event) => setDocumentId(event.target.value)}
                  >
                    {readyDocuments.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Quiz title" required>
                {(field) => (
                  <Input
                    {...field}
                    value={title}
                    placeholder="Chapter 3 review"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                )}
              </Field>

              <Field
                label="Number of questions"
                hint="Between 1 and 50."
                className="max-w-45"
              >
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min="1"
                    max="50"
                    value={numQuestions}
                    onChange={(event) => setNumQuestions(event.target.value)}
                  />
                )}
              </Field>

              <InlineError message={createError} />
            </CardBody>

            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-small max-w-md text-muted">
                Your quiz will contain a mix of question types &mdash; multiple choice, true or
                false, and short answer. The mix is chosen by the generator and cannot be set here.
              </p>
              <Button type="submit" loading={creating}>
                {creating ? 'Generating...' : 'Create quiz'}
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Read from the database, so the same quizzes appear on any device.
            This used to be a list kept in this browser's local storage - the
            quizzes were always saved on the server, but nothing listed them. */}
        {!loading && !loadError ? (
          <section>
            <h2 className="type-eyebrow mb-3">Your quizzes</h2>
            {quizzes.length === 0 ? (
              <p className="type-small measure text-muted">
                Nothing yet. Create one above and it will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {quizzes.map((quiz) => (
                  <li key={quiz.id}>
                    <Card interactive>
                      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <Link
                          to={`/quizzes/${quiz.id}`}
                          className="flex min-w-0 flex-1 items-center gap-4"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
                          >
                            <QuizIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {quiz.title}
                            </span>
                            <span className="type-micro block truncate text-faint">
                              {describeQuiz(quiz)}
                            </span>
                          </span>
                          <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
                        </Link>

                        <DeleteQuizButton
                          quiz={quiz}
                          onDeleted={(deletedId) =>
                            setQuizzes((current) =>
                              current.filter((item) => item.id !== deletedId),
                            )
                          }
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </>
  )
}

/**
 * Delete, in two steps and outside the row's link.
 *
 * Two steps because deleting a quiz also deletes every attempt recorded
 * against it, and those attempts are the only record of what was scored -
 * there is nothing to undo it with. The confirmation says so when there are
 * attempts to lose.
 */
function DeleteQuizButton({ quiz, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      await deleteQuiz(quiz.id)
      onDeleted(quiz.id)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete this quiz.'))
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
      <span className="type-micro text-muted">
        {quiz.attemptsCount
          ? `Delete this quiz and its ${quiz.attemptsCount} ${
              quiz.attemptsCount === 1 ? 'attempt' : 'attempts'
            }?`
          : 'Delete this quiz?'}
      </span>
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

/** The second line of a quiz row: where it came from and what is in it. */
function describeQuiz(quiz) {
  const parts = []

  if (quiz.documentTitle) parts.push(quiz.documentTitle)

  if (quiz.questionsCount != null) {
    parts.push(`${quiz.questionsCount} ${quiz.questionsCount === 1 ? 'question' : 'questions'}`)
  }

  if (quiz.attemptsCount) {
    parts.push(`${quiz.attemptsCount} ${quiz.attemptsCount === 1 ? 'attempt' : 'attempts'}`)
  }

  const date = formatDate(quiz.createdAt)
  if (date) parts.push(date)

  return parts.join(' · ')
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}