import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listDocuments, isReady } from '../api/documents'
import {
  createQuiz,
  deleteQuiz,
  listQuizzes,
  renameQuiz,
  setQuizPinned,
} from '../api/quizzes'
import { getErrorMessage } from '../lib/errors'
import { sortPinnedFirst } from '../lib/pinned'
import PageHeader from '../components/PageHeader'
import PinButton from '../components/PinButton'
import VoiceInput from '../components/VoiceInput'
import { ChevronIcon, DocumentIcon, QuizIcon } from '../components/icons'
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
  cx,
} from '../components/ui'

/* The three types the backend knows. Sent as a list; sending all three is
   the same as sending none, which is how the endpoint behaved before the
   choice existed. */
const QUESTION_TYPE_CHOICES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
]

const ALL_TYPES = QUESTION_TYPE_CHOICES.map((choice) => choice.value)

/* Which document's quizzes are being shown lives in the query string, not in
   the path: /quizzes/<id> already means one quiz, and a second meaning for the
   same shape would be a trap for anyone reading a URL. ?conversation= in
   DocumentChat.jsx is the same idea, so the two pages read alike. */
const DOCUMENT_PARAM = 'document'

export default function Quizzes() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDocumentId = searchParams.get(DOCUMENT_PARAM) || ''

  const [documents, setDocuments] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [documentId, setDocumentId] = useState('')
  const [title, setTitle] = useState('')
  const [numQuestions, setNumQuestions] = useState(10)
  const [questionTypes, setQuestionTypes] = useState(ALL_TYPES)
  const [startPage, setStartPage] = useState('')
  const [endPage, setEndPage] = useState('')
  const [description, setDescription] = useState('')

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  /* A quiz that was generated with something to say about itself. The page
     stays put in that case, so the warnings are read rather than flashed
     past on the way to the quiz. */
  const [createdWithWarnings, setCreatedWithWarnings] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [docs, savedQuizzes] = await Promise.all([listDocuments(), listQuizzes()])
      setDocuments(docs)
      setQuizzes(savedQuizzes)
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load your quizzes.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const readyDocuments = useMemo(
    () => documents.filter((doc) => isReady(doc.status)),
    [documents],
  )

  const selectedDocument = useMemo(
    () => readyDocuments.find((doc) => String(doc.id) === selectedDocumentId) || null,
    [readyDocuments, selectedDocumentId],
  )

  /* The document the FORM is pointed at, which is not always the one the list
     below is scoped to - the dropdown can be changed without leaving the
     document being browsed. */
  const formDocument = useMemo(
    () => readyDocuments.find((doc) => String(doc.id) === String(documentId)) || null,
    [readyDocuments, documentId],
  )

  /* page_count is not part of the documented DocumentResponse shape, so it may
     simply not be there. The page hint mentions it when it is and says
     nothing when it is not: no part of this page may depend on it. */
  const formDocumentPageCount =
    typeof formDocument?.page_count === 'number' && formDocument.page_count > 0
      ? formDocument.page_count
      : null

  /* The dropdown and the ?document= parameter are two ways of saying the same
     thing, so they are kept in agreement rather than allowed to disagree:
     opening a document's quizzes preselects it in the form, and with nothing
     selected the form falls back to the first processed document. */
  useEffect(() => {
    if (readyDocuments.length === 0) return

    if (selectedDocumentId && selectedDocument) {
      setDocumentId(selectedDocumentId)
      return
    }

    setDocumentId((current) =>
      current && readyDocuments.some((doc) => String(doc.id) === current)
        ? current
        : String(readyDocuments[0].id),
    )
  }, [readyDocuments, selectedDocument, selectedDocumentId])

  function openDocument(id) {
    setSearchParams({ [DOCUMENT_PARAM]: String(id) })
  }

  function clearDocument() {
    setSearchParams({})
  }

  function toggleQuestionType(value) {
    setQuestionTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : ALL_TYPES.filter((item) => current.includes(item) || item === value),
    )
  }

  /* Mirrors the checks the backend makes, so a request that cannot succeed is
     answered here instead of after a round trip - and, for the page range and
     the question count, instead of after a generation that would have been
     thrown away. The backend still makes every one of these checks itself. */
  function validate() {
    if (!documentId) return 'Pick a document first.'
    if (!title.trim()) return 'Give the quiz a title.'

    const count = Number(numQuestions)
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return 'Ask for between 1 and 50 questions.'
    }

    if (questionTypes.length === 0) return 'Pick at least one question type.'

    if (count < questionTypes.length) {
      return (
        `${count} question${count === 1 ? '' : 's'} is not enough for ` +
        `${questionTypes.length} question types: each type needs at least one question.`
      )
    }

    const hasStart = startPage !== ''
    const hasEnd = endPage !== ''

    if (hasStart !== hasEnd) {
      return 'Give both a first and a last page, or leave both empty.'
    }

    if (hasStart) {
      const first = Number(startPage)
      const last = Number(endPage)

      if (!Number.isInteger(first) || first < 1) return 'The first page must be 1 or greater.'
      if (!Number.isInteger(last)) return 'The last page must be a whole number.'
      if (last < first) return 'The last page cannot come before the first page.'
    }

    return null
  }

  async function handleCreate(event) {
    event.preventDefault()
    setCreateError(null)
    setCreatedWithWarnings(null)

    const problem = validate()
    if (problem) {
      setCreateError(problem)
      return
    }

    setCreating(true)
    try {
      const quiz = await createQuiz({
        documentId,
        title: title.trim(),
        numQuestions,
        questionTypes,
        description,
        startPage,
        endPage,
      })

      if (!quiz.id) {
        setCreateError(
          'The quiz was created but the response contained no quiz_id, so it cannot be opened.',
        )
        return
      }

      /* Generation takes tens of seconds, and after that wait the question in
         the student's mind is whether the questions came out well - so the
         quiz opens straight away. A quiz nobody looks at is a quiz nobody can
         judge. Warnings are the exception: they deserve a beat, and would
         scroll past unseen on the quiz page. */
      if (quiz.warnings.length === 0) {
        navigate(`/quizzes/${quiz.id}`)
        return
      }

      setCreatedWithWarnings(quiz)
      setTitle('')
      await load()
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Could not create the quiz.'))
    } finally {
      setCreating(false)
    }
  }

  function handleRenamed(quizId, newTitle) {
    setQuizzes((current) =>
      current.map((quiz) => (quiz.id === quizId ? { ...quiz, title: newTitle } : quiz)),
    )
  }

  /* The row is updated in place rather than reloading the list - one field
     changed and the server has already confirmed it - but the list is
     re-sorted so the row actually moves. Without that the icon fills and
     nothing else happens, which reads as a pin that did not take. */
  function handlePinned(quizId, isPinned) {
    setQuizzes((current) =>
      sortPinnedFirst(
        current.map((quiz) => (quiz.id === quizId ? { ...quiz, isPinned } : quiz)),
      ),
    )
  }

  function handleDeleted(deletedId) {
    setQuizzes((current) => current.filter((quiz) => quiz.id !== deletedId))
  }

  const visibleQuizzes = selectedDocumentId
    ? quizzes.filter((quiz) => String(quiz.documentId) === selectedDocumentId)
    : quizzes

  /* A document id in the URL that no longer matches a processed document -
     the document was deleted, or the link was shared from another account.
     Saying so beats rendering an empty list that looks like a document with
     no quizzes. */
  const unknownDocument = Boolean(selectedDocumentId) && !selectedDocument && !loading && !loadError

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
          <>
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
                  hint="Between 1 and 50, and at least one for each type you pick."
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

                {/* A checkbox group rather than a dropdown: the useful requests
                    are combinations - multiple choice plus short answer, say -
                    and a dropdown cannot express one. */}
                <fieldset>
                  <legend className="type-small mb-1.5 font-medium text-ink">
                    Question types
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_TYPE_CHOICES.map((choice) => {
                      const checked = questionTypes.includes(choice.value)
                      return (
                        <label
                          key={choice.value}
                          className={cx(
                            'flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors duration-150',
                            checked
                              ? 'border-accent bg-accent-soft text-ink'
                              : 'border-line bg-surface text-muted hover:border-line-strong hover:bg-sunken/60',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestionType(choice.value)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={cx(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border',
                              checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface',
                            )}
                          >
                            {checked ? (
                              <span className="h-1.5 w-1.5 rounded-xs bg-on-accent" />
                            ) : null}
                          </span>
                          {choice.label}
                        </label>
                      )
                    })}
                  </div>
                  <p className="type-micro mt-1.5 text-faint">
                    Pick at least one. All three is the same as leaving it alone. The
                    questions are split evenly between the types you pick.
                  </p>
                </fieldset>

                {/* Both boxes or neither: half a range is a half-finished
                    thought, and the backend refuses it rather than guessing
                    which half was meant. */}
                <fieldset>
                  <legend className="type-small mb-1.5 font-medium text-ink">
                    Pages <span className="font-normal text-faint">(optional)</span>
                  </legend>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="From" className="max-w-32">
                      {(field) => (
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          value={startPage}
                          placeholder="1"
                          onChange={(event) => setStartPage(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="To" className="max-w-32">
                      {(field) => (
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          value={endPage}
                          placeholder="20"
                          onChange={(event) => setEndPage(event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                  <p className="type-micro mt-1.5 text-faint">
                    Counted from the first page of the PDF file, which is often not the
                    number printed on the page.
                    {formDocumentPageCount ? ` This document has ${formDocumentPageCount} pages.` : ''}{' '}
                    Leave both empty to use the whole document.
                  </p>
                </fieldset>

                {/* Steers generation only. It is not saved with the quiz, so it
                    will not appear anywhere after the quiz is created. */}
                <div>
                  <label
                    htmlFor="quiz-description"
                    className="type-small mb-1.5 block font-medium text-ink"
                  >
                    What should it focus on?{' '}
                    <span className="font-normal text-faint">(optional)</span>
                  </label>
                  {/* Typing and speaking fill the same field, so the
                      microphone sits beside the box rather than under a
                      heading of its own. It renders nothing at all in a
                      browser without the speech API, which is why there is
                      no fallback to arrange here. */}
                  <div className="flex flex-wrap items-start gap-3">
                    <textarea
                      id="quiz-description"
                      rows={3}
                      value={description}
                      placeholder="For example: the rules of building the imperative verb, not the vocabulary"
                      onChange={(event) => setDescription(event.target.value)}
                      className="min-w-64 flex-1 rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <VoiceInput value={description} onChange={setDescription} />
                  </div>
                  <p className="type-micro mt-1.5 text-faint">
                    Used while generating, then discarded. It is not saved with the quiz.
                  </p>
                </div>

                <InlineError message={createError} />

                {createdWithWarnings ? (
                  <QuizWarnings quiz={createdWithWarnings} />
                ) : null}
              </CardBody>

              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <p className="type-small max-w-md text-muted">
                  Questions are written from this document only. Anything the generator
                  produces outside the types you picked is discarded before the quiz is saved.
                </p>
                <Button type="submit" loading={creating}>
                  {creating ? 'Generating...' : 'Create quiz'}
                </Button>
              </CardFooter>
            </Card>

            {unknownDocument ? (
              <EmptyState
                icon={<DocumentIcon className="h-5 w-5" />}
                title="That document is not here"
                description="It may have been deleted, or it may still be processing. The list of documents below has the ones that can be quizzed."
                action={
                  <Button variant="secondary" onClick={clearDocument}>
                    All documents
                  </Button>
                }
              />
            ) : selectedDocument ? (
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="type-eyebrow">Quizzes from {selectedDocument.title}</h2>
                  <button
                    type="button"
                    onClick={clearDocument}
                    className="type-small rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
                  >
                    ← All documents
                  </button>
                </div>

                {visibleQuizzes.length === 0 ? (
                  <p className="type-small measure text-muted">
                    No quizzes from this document yet. Create one above and it will appear here.
                  </p>
                ) : (
                  <QuizList
                    quizzes={visibleQuizzes}
                    showDocument={false}
                    onRenamed={handleRenamed}
                    onPinned={handlePinned}
                    onDeleted={handleDeleted}
                  />
                )}
              </section>
            ) : (
              <section>
                <h2 className="type-eyebrow mb-3">Your documents</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {readyDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      quizCount={
                        quizzes.filter((quiz) => String(quiz.documentId) === String(doc.id)).length
                      }
                      onOpen={() => openDocument(doc.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * What the generator could not do, said out loud.
 *
 * A quiz with warnings was still saved and is still worth taking - a missing
 * question type does not make the other questions wrong - so this offers the
 * way in rather than blocking it.
 */
function QuizWarnings({ quiz }) {
  return (
    <div
      role="status"
      className="rounded-sm border border-line-strong bg-sunken/60 px-3.5 py-3"
    >
      <p className="text-sm font-medium text-ink">
        “{quiz.title}” was created, with something to mention:
      </p>
      <ul className="type-small mt-2 list-disc space-y-1 pl-5 text-muted">
        {quiz.warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
      <Link
        to={`/quizzes/${quiz.id}`}
        className="type-small mt-3 inline-flex font-medium text-accent hover:underline"
      >
        Open the quiz →
      </Link>
    </div>
  )
}

/**
 * One document in the grid, with how many quizzes it has.
 *
 * A document with no quizzes is still shown. It is the only place its first
 * quiz can be started from, and a grid that hid it would hide the way in.
 */
function DocumentCard({ document, quizCount, onOpen }) {
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
          <span className="block truncate text-sm font-medium text-ink">{document.title}</span>
          <span className="type-micro block text-faint">
            {quizCount === 0
              ? 'No quizzes yet'
              : `${quizCount} ${quizCount === 1 ? 'quiz' : 'quizzes'}`}
          </span>
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
      </button>
    </Card>
  )
}

/* Read from the database, so the same quizzes appear on any device. This used
   to be a list kept in this browser's local storage - the quizzes were always
   saved on the server, but nothing listed them. */
function QuizList({ quizzes, showDocument, onRenamed, onPinned, onDeleted }) {
  return (
    <ul className="space-y-2">
      {quizzes.map((quiz) => (
        <li key={quiz.id}>
          <QuizRow
            quiz={quiz}
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
 * One quiz: open it, pin it, rename it, or delete it.
 *
 * Renaming swaps the row for an input rather than opening a dialog - it is one
 * short field, and the row is where the name is being read from.
 */
function QuizRow({ quiz, showDocument, onRenamed, onPinned, onDeleted }) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(quiz.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startRenaming() {
    setDraft(quiz.title)
    setError(null)
    setRenaming(true)
  }

  async function handleSave(event) {
    event.preventDefault()

    const next = draft.trim()

    if (!next) {
      setError('A quiz needs a title.')
      return
    }

    if (next === quiz.title) {
      setRenaming(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const updated = await renameQuiz(quiz.id, next)
      /* The server has accepted the new title and nothing else about the quiz
         changed, so the row is updated in place instead of reloading the
         whole list. */
      onRenamed(quiz.id, updated.title)
      setRenaming(false)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not rename this quiz.'))
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
              aria-label="Quiz title"
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" loading={saving}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => setRenaming(false)}
            >
              Cancel
            </Button>
          </div>
          {/* In the row, not at the top of the page: the row is what failed. */}
          <InlineError message={error} />
        </form>
      </Card>
    )
  }

  return (
    <Card interactive>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Link to={`/quizzes/${quiz.id}`} className="flex min-w-0 flex-1 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
          >
            <QuizIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{quiz.title}</span>
            <span className="type-micro block truncate text-faint">
              {describeQuiz(quiz, showDocument)}
            </span>
          </span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-faint" />
        </Link>

        {/* Beside Rename and Delete, and before them: it is the one control
            here that takes effect on the first click. */}
        <PinButton
          pinned={quiz.isPinned}
          noun="quiz"
          onToggle={async (next) => {
            const updated = await setQuizPinned(quiz.id, next)
            onPinned(quiz.id, updated.isPinned)
          }}
        />

        <div className="shrink-0 text-right">
          <button
            type="button"
            onClick={startRenaming}
            className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            Rename
          </button>
          {error ? <p className="type-micro mt-1 text-danger">{error}</p> : null}
        </div>

        <DeleteQuizButton quiz={quiz} onDeleted={onDeleted} />
      </div>
    </Card>
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

/**
 * The second line of a quiz row: what is in it.
 *
 * The document name is left out when the list is already one document's
 * quizzes - it would be the same words under every row.
 */
function describeQuiz(quiz, showDocument = true) {
  const parts = []

  if (showDocument && quiz.documentTitle) parts.push(quiz.documentTitle)

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
