import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listDocuments, isReady } from '../api/documents'
import { createQuiz } from '../api/quizzes'
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

/**
 * The API has no "list quizzes" endpoint, so quizzes created in this browser
 * are remembered locally just so they can be reopened. Client-side convenience
 * only - it is not backend state.
 */
const RECENT_KEY = 'studymate.recent_quizzes'

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function rememberQuiz(quiz) {
  if (!quiz?.id) return
  try {
    const next = [
      { id: quiz.id, title: quiz.title || 'Untitled quiz', createdAt: new Date().toISOString() },
      ...readRecent().filter((item) => item.id !== quiz.id),
    ].slice(0, 20)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export default function Quizzes() {
  const navigate = useNavigate()

  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [documentId, setDocumentId] = useState('')
  const [title, setTitle] = useState('')
  const [numQuestions, setNumQuestions] = useState(10)

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [recent, setRecent] = useState(readRecent)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const docs = await listDocuments()
      setDocuments(docs)
      const firstReady = docs.find((doc) => isReady(doc.status))
      if (firstReady) setDocumentId((current) => current || firstReady.id)
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load your documents.'))
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
        rememberQuiz(quiz)
        setRecent(readRecent())
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
          <LoadingState label="Loading your documents" rows={2} />
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

        <section>
          <h2 className="type-eyebrow mb-3">Created in this browser</h2>
          {recent.length === 0 ? (
            <p className="type-small measure text-muted">
              Nothing yet. The API has no list-quizzes endpoint, so this list only remembers
              quizzes created on this device.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {recent.map((quiz) => (
                  <li key={quiz.id}>
                    <Card interactive>
                      <Link
                        to={`/quizzes/${quiz.id}`}
                        className="flex items-center gap-4 px-4 py-3 sm:px-5"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
                        >
                          <QuizIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {quiz.title}
                        </span>
                        <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="type-micro mt-3 text-muted underline underline-offset-4 transition-colors hover:text-ink"
                onClick={() => {
                  try {
                    localStorage.removeItem(RECENT_KEY)
                  } catch {
                    /* ignore */
                  }
                  setRecent([])
                }}
              >
                Clear this list
              </button>
            </>
          )}
        </section>
      </div>
    </>
  )
}
