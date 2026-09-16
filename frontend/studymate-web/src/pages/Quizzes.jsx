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
import { useI18n } from '../context/I18nContext'
import { dateLocale, isolate } from '../lib/language'
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
  { value: 'multiple_choice', labelKey: 'quiz.typeMultipleChoice' },
  { value: 'true_false', labelKey: 'quiz.typeTrueFalse' },
  { value: 'short_answer', labelKey: 'quiz.typeShortAnswer' },
]

const ALL_TYPES = QUESTION_TYPE_CHOICES.map((choice) => choice.value)

/* Which document's quizzes are being shown lives in the query string, not in
   the path: /quizzes/<id> already means one quiz, and a second meaning for the
   same shape would be a trap for anyone reading a URL. ?conversation= in
   DocumentChat.jsx is the same idea, so the two pages read alike. */
const DOCUMENT_PARAM = 'document'

export default function Quizzes() {
  const { t } = useI18n()
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
      setLoadError(getErrorMessage(err, t, 'quiz.couldNotLoad'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
    if (!documentId) return t('quiz.pickDocument')
    if (!title.trim()) return t('quiz.giveTitle')

    const count = Number(numQuestions)
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return t('quiz.countRange')
    }

    if (questionTypes.length === 0) return t('quiz.pickType')

    if (count < questionTypes.length) {
      /* One whole sentence per plural form rather than an "s" glued on: the
         singular and the plural differ in more than a letter in most
         languages, and in Arabic there are more than two of them. */
      return count === 1
        ? t('quiz.notEnoughQuestionsOne', { count, types: questionTypes.length })
        : t('quiz.notEnoughQuestionsOther', { count, types: questionTypes.length })
    }

    const hasStart = startPage !== ''
    const hasEnd = endPage !== ''

    if (hasStart !== hasEnd) {
      return t('quiz.pageRangeBoth')
    }

    if (hasStart) {
      const first = Number(startPage)
      const last = Number(endPage)

      if (!Number.isInteger(first) || first < 1) return t('quiz.firstPageMin')
      if (!Number.isInteger(last)) return t('quiz.lastPageWhole')
      if (last < first) return t('quiz.lastPageBeforeFirst')
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
        setCreateError(t('quiz.noQuizId'))
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
      setCreateError(getErrorMessage(err, t, 'quiz.couldNotCreate'))
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
        eyebrow={t('quiz.eyebrow')}
        title={t('quiz.title')}
        description={t('quiz.description')}
      />

      <div className="space-y-8">
        {loading ? (
          <LoadingState label={t('quiz.loading')} rows={2} />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : readyDocuments.length === 0 ? (
          <EmptyState
            icon={<QuizIcon className="h-5 w-5" />}
            title={t('quiz.noDocumentsTitle')}
            description={t('quiz.noDocumentsDescription')}
            action={
              <Link
                to="/documents"
                className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
              >
                {t('quiz.goToDocuments')}
              </Link>
            }
          />
        ) : (
          <>
            <Card as="form" onSubmit={handleCreate}>
              <CardBody className="space-y-4">
                <Field label={t('quiz.documentLabel')} required>
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

                <Field label={t('quiz.titleLabel')} required>
                  {(field) => (
                    <Input
                      {...field}
                      dir="auto"
                      value={title}
                      placeholder={t('quiz.titlePlaceholder')}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  )}
                </Field>

                <Field
                  label={t('quiz.countLabel')}
                  hint={t('quiz.countHint')}
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
                    {t('quiz.typesLegend')}
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
                          {t(choice.labelKey)}
                        </label>
                      )
                    })}
                  </div>
                  <p className="type-micro mt-1.5 text-faint">{t('quiz.typesHint')}</p>
                </fieldset>

                {/* Both boxes or neither: half a range is a half-finished
                    thought, and the backend refuses it rather than guessing
                    which half was meant. */}
                <fieldset>
                  <legend className="type-small mb-1.5 font-medium text-ink">
                    {t('quiz.pagesLegend')}{' '}
                    <span className="font-normal text-faint">{t('common.optional')}</span>
                  </legend>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t('quiz.pageFrom')} className="max-w-32">
                      {(field) => (
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          value={startPage}
                          placeholder={t('quiz.pageFromPlaceholder')}
                          onChange={(event) => setStartPage(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field label={t('quiz.pageTo')} className="max-w-32">
                      {(field) => (
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          value={endPage}
                          placeholder={t('quiz.pageToPlaceholder')}
                          onChange={(event) => setEndPage(event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                  {/* Three sentences, joined exactly as they were: the middle
                      one appears only when the server told us a page count. */}
                  <p className="type-micro mt-1.5 text-faint">
                    {t('quiz.pagesHint')}
                    {formDocumentPageCount
                      ? ` ${t('quiz.pagesHintCount', { count: formDocumentPageCount })}`
                      : ''}{' '}
                    {t('quiz.pagesHintWhole')}
                  </p>
                </fieldset>

                {/* Steers generation only. It is not saved with the quiz, so it
                    will not appear anywhere after the quiz is created. */}
                <div>
                  <label
                    htmlFor="quiz-description"
                    className="type-small mb-1.5 block font-medium text-ink"
                  >
                    {t('quiz.focusLabel')}{' '}
                    <span className="font-normal text-faint">{t('common.optional')}</span>
                  </label>
                  {/* Typing and speaking fill the same field, so the
                      microphone sits beside the box rather than under a
                      heading of its own. It renders nothing at all in a
                      browser without the speech API, which is why there is
                      no fallback to arrange here. */}
                  <div className="flex flex-wrap items-start gap-3">
                    {/* What to focus on is the student's own description of
                        their material, written in its language. */}
                    <textarea
                      id="quiz-description"
                      dir="auto"
                      rows={3}
                      value={description}
                      placeholder={t('quiz.focusPlaceholder')}
                      onChange={(event) => setDescription(event.target.value)}
                      className="min-w-64 flex-1 rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <VoiceInput value={description} onChange={setDescription} />
                  </div>
                  <p className="type-micro mt-1.5 text-faint">{t('quiz.focusHint')}</p>
                </div>

                <InlineError message={createError} />

                {createdWithWarnings ? (
                  <QuizWarnings quiz={createdWithWarnings} />
                ) : null}
              </CardBody>

              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <p className="type-small max-w-md text-muted">{t('quiz.footerNote')}</p>
                <Button type="submit" loading={creating}>
                  {creating ? t('quiz.generating') : t('quiz.create')}
                </Button>
              </CardFooter>
            </Card>

            {unknownDocument ? (
              <EmptyState
                icon={<DocumentIcon className="h-5 w-5" />}
                title={t('quiz.unknownDocumentTitle')}
                description={t('quiz.unknownDocumentDescription')}
                action={
                  <Button variant="secondary" onClick={clearDocument}>
                    {t('quiz.allDocumentsButton')}
                  </Button>
                }
              />
            ) : selectedDocument ? (
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  {/* The document's own title is the student's, so it is
                      dropped into the sentence rather than translated with it. */}
                  <h2 className="type-eyebrow">
                    {t('quiz.fromDocument', { title: isolate(selectedDocument.title) })}
                  </h2>
                  <button
                    type="button"
                    onClick={clearDocument}
                    className="type-small rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
                  >
                    {/* The arrow is an element of its own rather than a character
                inside the sentence, so a right-to-left layout can mirror it
                without mirroring the words beside it. */}
                    <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
                      ←
                    </span>{' '}
                    {t('quiz.allDocumentsBack')}
                  </button>
                </div>

                {visibleQuizzes.length === 0 ? (
                  <p className="type-small measure text-muted">{t('quiz.noneFromDocument')}</p>
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
                <h2 className="type-eyebrow mb-3">{t('quiz.yourDocuments')}</h2>
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
  const { t } = useI18n()

  return (
    <div
      role="status"
      className="rounded-sm border border-line-strong bg-sunken/60 px-3.5 py-3"
    >
      {/* The quiz's title and every warning under it come from the server -
          the student's content and the generator's own words, neither ours to
          translate. Only the sentence around the title is. */}
      <p className="text-sm font-medium text-ink">
        {t('quiz.createdWithWarnings', { title: isolate(quiz.title) })}
      </p>
      <ul className="type-small mt-2 list-disc space-y-1 ps-5 text-muted">
        {quiz.warnings.map((warning, index) => (
          <li dir="auto" key={index}>
            {warning}
          </li>
        ))}
      </ul>
      <Link
        to={`/quizzes/${quiz.id}`}
        className="type-small mt-3 inline-flex font-medium text-accent hover:underline"
      >
        {t('quiz.openQuiz')}{' '}
        <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
          →
        </span>
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
  const { t } = useI18n()

  return (
    <Card interactive>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-4 text-start"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-muted"
        >
          <DocumentIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-sm font-medium text-ink">
            {document.title}
          </span>
          <span className="type-micro block text-faint">
            {quizCount === 0
              ? t('quiz.noneYet')
              : quizCount === 1
                ? t('quiz.countOne', { count: quizCount })
                : t('quiz.countOther', { count: quizCount })}
          </span>
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-faint rtl:-scale-x-100" />
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
  const { t, lang } = useI18n()

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
      setError(t('quiz.needsTitle'))
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
      setError(getErrorMessage(err, t, 'quiz.couldNotRename'))
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
              dir="auto"
              value={draft}
              aria-label={t('quiz.renameLabel')}
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
            <span dir="auto" className="block truncate text-sm font-medium text-ink">
              {quiz.title}
            </span>
            <span className="type-micro block truncate text-faint">
              {describeQuiz(t, dateLocale(lang), quiz, showDocument)}
            </span>
          </span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-faint rtl:-scale-x-100" />
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

        <div className="shrink-0 text-end">
          <button
            type="button"
            onClick={startRenaming}
            className="type-micro rounded-sm px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            {t('common.rename')}
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
  const { t } = useI18n()

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
      setError(getErrorMessage(err, t, 'quiz.couldNotDelete'))
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <div className="shrink-0 text-end">
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
      <span className="type-micro text-muted">
        {quiz.attemptsCount
          ? quiz.attemptsCount === 1
            ? t('quiz.confirmDeleteWithAttemptsOne', { count: quiz.attemptsCount })
            : t('quiz.confirmDeleteWithAttemptsOther', { count: quiz.attemptsCount })
          : t('quiz.confirmDelete')}
      </span>
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

/**
 * The second line of a quiz row: what is in it.
 *
 * The document name is left out when the list is already one document's
 * quizzes - it would be the same words under every row.
 *
 * `t` and `locale` are passed in because this is not a component. It used to
 * build "3 questions" out of a number and a bare English plural, which is a
 * sentence that cannot be translated: Arabic has six plural forms, and this
 * project has no plural machinery and deliberately wants none. The English
 * keys keep the two forms English needs; the Arabic side sidesteps the
 * problem in wording, with "عدد الأسئلة: 3" rather than a counted plural.
 */
function describeQuiz(t, locale, quiz, showDocument = true) {
  const parts = []

  /* The document's own title, isolated because it is content sitting in a
     line of ours and may run the other way. */
  if (showDocument && quiz.documentTitle) parts.push(isolate(quiz.documentTitle))

  if (quiz.questionsCount != null) {
    parts.push(
      quiz.questionsCount === 1
        ? t('quiz.rowQuestionsOne', { count: quiz.questionsCount })
        : t('quiz.rowQuestionsOther', { count: quiz.questionsCount }),
    )
  }

  if (quiz.attemptsCount) {
    parts.push(
      quiz.attemptsCount === 1
        ? t('quiz.rowAttemptsOne', { count: quiz.attemptsCount })
        : t('quiz.rowAttemptsOther', { count: quiz.attemptsCount }),
    )
  }

  const date = formatDate(quiz.createdAt, locale)
  if (date) parts.push(date)

  return parts.join(' · ')
}

function formatDate(value, locale) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
