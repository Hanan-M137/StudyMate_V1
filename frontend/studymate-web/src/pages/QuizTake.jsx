import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getQuiz,
  getQuizAttempt,
  listQuizAttempts,
  submitQuizAttempt,
} from '../api/quizzes'
import { getErrorMessage } from '../lib/errors'
import { CheckIcon, CloseIcon } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
  cx,
} from '../components/ui'

export default function QuizTake() {
  const { quizId } = useParams()

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [result, setResult] = useState(null)
  const [attempts, setAttempts] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setAnswers({})
    try {
      const loaded = await getQuiz(quizId)
      setQuiz(loaded)
      // A failure here must not hide the quiz itself, so the list
      // falls back to empty rather than becoming a page error.
      setAttempts(await listQuizAttempts(quizId).catch(() => []))
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this quiz.'))
    } finally {
      setLoading(false)
    }
  }, [quizId])

  useEffect(() => {
    load()
  }, [load])

  const questions = quiz?.questions || []
  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => String(value ?? '').trim() !== '').length,
    [answers],
  )

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      // { answers: { "<question_id>": "A" | "true" | "free text" } }
      const payload = {}
      for (const [questionId, value] of Object.entries(answers)) {
        const trimmed = String(value ?? '').trim()
        if (trimmed !== '') payload[questionId] = trimmed
      }
      setResult(await submitQuizAttempt(quizId, payload))
      // The attempt just recorded belongs in the table too.
      listQuizAttempts(quizId).then(setAttempts).catch(() => {})
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Could not submit your answers.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState label="Loading quiz" rows={3} />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!quiz) return <EmptyState title="Quiz not found" />

  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <div>
      <header className="mb-6">
        <Link
          to="/quizzes"
          className="type-micro font-medium text-muted transition-colors hover:text-ink"
        >
          &larr; All quizzes
        </Link>
        <h1 className="type-display mt-1.5">{quiz.title}</h1>
        <p className="type-small mt-1 text-muted">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'} &middot; mixed
          question types
        </p>
      </header>

      {result ? <ScoreCard result={result} questionCount={questions.length} /> : null}

      <AttemptsTable quizId={quizId} attempts={attempts} />

      {!result && questions.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="type-micro mb-1.5 flex items-center justify-between text-muted">
            <span>
              {answeredCount} of {questions.length} answered
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label="Questions answered"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <EmptyState
          title="This quiz has no questions"
          description="The API returned no questions for this quiz."
          action={
            <Button variant="secondary" onClick={load}>
              Reload
            </Button>
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              total={questions.length}
              question={question}
              value={answers[question.id] ?? ''}
              locked={Boolean(result)}
              feedback={findFeedback(result, question.id)}
              onChange={(value) =>
                setAnswers((current) => ({ ...current, [question.id]: value }))
              }
            />
          ))}

          <InlineError message={submitError} />

          {!result ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" size="lg" loading={submitting} disabled={answeredCount === 0}>
                Submit answers
              </Button>
              {answeredCount < questions.length ? (
                <span className="type-small text-muted">
                  {questions.length - answeredCount} unanswered
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null)
                  setAnswers({})
                }}
              >
                Retake quiz
              </Button>
              <Link
                to="/quizzes"
                className="inline-flex h-10 items-center rounded-sm px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
              >
                Back to quizzes
              </Link>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

function QuestionCard({ index, total, question, value, locked, feedback, onChange }) {
  /* Three outcomes, not two: a short answer can be partially right, and the
     student is told which part they got. `correct` is kept as the fallback so
     an older response without `verdict` still renders. */
  const state = feedback
    ? feedback.verdict || (feedback.correct ? 'correct' : 'incorrect')
    : 'neutral'

  return (
    <Card
      as="fieldset"
      disabled={locked}
      className={cx(
        'px-4 py-4 sm:px-6 sm:py-5',
        state === 'correct' && 'border-accent-line',
        /* Only accent/danger/neutral tones are known to exist in the design
           system, so partial borrows the strong neutral border rather than a
           colour that may not be defined. See the note at the bottom of this
           file for the one-line upgrade if a warning tone exists. */
        state === 'partial' && 'border-line-strong',
        state === 'incorrect' && 'border-danger-line',
      )}
    >
      <legend className="sr-only">
        Question {index + 1} of {total}
      </legend>

      <div className="mb-3.5 flex items-start justify-between gap-4">
        <p className="measure type-body font-medium text-ink">
          <span className="mr-2 text-faint tabular-nums">{index + 1}.</span>
          {question.text || <em className="text-muted">(no question text returned)</em>}
        </p>
        <Badge
          tone={
            state === 'incorrect'
              ? 'danger'
              : state === 'correct'
                ? 'accent'
                : 'neutral'
          }
        >
          {question.typeLabel}
        </Badge>
      </div>

      {question.isFreeText ? (
        <div className="measure">
          <label htmlFor={`answer-${question.id}`} className="sr-only">
            Your answer
          </label>
          {/* A textarea, not a single-line input: the stored correct answers
              average 16.9 words, so an answer worth writing does not fit on
              one line. */}
          <textarea
            id={`answer-${question.id}`}
            value={value}
            disabled={locked}
            rows={3}
            placeholder="Type your answer"
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-70"
          />
          <p className="type-micro mt-1.5 text-faint">
            {question.isKnownType
              ? 'Answer in your own words. It is judged on meaning, not on matching the document’s wording.'
              : 'This question type was not recognised, so it accepts a free-text answer.'}
          </p>
        </div>
      ) : (
        <div className="measure space-y-2" role="radiogroup" aria-label={question.text || 'Options'}>
          {question.options.map((option) => {
            const selected = value === option.key

            /* Marked only after submitting: `correct_answer` is absent from
               GET /quizzes/{id}, so before an answer is given there is nothing
               here to read, in the page or in its source. */
            const isCorrectOption =
              feedback?.correct_answer != null &&
              String(feedback.correct_answer).trim().toLowerCase() ===
                option.key.trim().toLowerCase()

            return (
              <label
                key={option.key}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-sm border px-3.5 py-2.5 transition-colors duration-150',
                  isCorrectOption
                    ? 'border-accent bg-accent-soft'
                    : selected && state === 'incorrect'
                      ? 'border-danger-line bg-danger-soft'
                      : selected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/60',
                  locked && 'cursor-default',
                )}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.key}
                  checked={selected}
                  disabled={locked}
                  onChange={() => onChange(option.key)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-accent bg-accent' : 'border-line-strong bg-surface',
                  )}
                >
                  {selected ? <span className="h-1.5 w-1.5 rounded-full bg-on-accent" /> : null}
                </span>
                <span className="type-small text-ink">
                  {question.type === 'multiple_choice' ? (
                    <span className="mr-2 font-semibold text-muted">{option.key}</span>
                  ) : null}
                  {option.text}
                  {isCorrectOption ? (
                    <span className="type-micro ml-2 font-semibold text-accent">
                      Correct answer
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
      )}

      {question.sourcePage != null ? (
        <p className="type-micro mt-3 text-faint">From page {question.sourcePage}</p>
      ) : null}

      {feedback ? (
        <Feedback feedback={feedback} isFreeText={question.isFreeText} />
      ) : null}
    </Card>
  )
}

/**
 * results entries are { question_id, student_answer, correct, verdict,
 * reason, correct_answer, explanation }.
 */
function Feedback({ feedback, isFreeText }) {
  const verdict = feedback.verdict || (feedback.correct ? 'correct' : 'incorrect')

  const tone =
    verdict === 'correct'
      ? 'bg-accent-soft text-accent'
      : verdict === 'partial'
        ? 'bg-sunken text-ink'
        : 'bg-danger-soft text-danger'

  const label =
    verdict === 'correct'
      ? 'Correct'
      : verdict === 'partial'
        ? 'Partially correct'
        : 'Incorrect'

  return (
    <div className={cx('mt-4 flex items-start gap-2.5 rounded-sm px-3.5 py-2.5', tone)}>
      {verdict === 'incorrect' ? (
        <CloseIcon className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="type-small">
        <p className="font-semibold">{label}</p>
        {feedback.reason ? <p className="mt-0.5 opacity-90">{feedback.reason}</p> : null}
        {feedback.student_answer != null ? (
          <p className="mt-0.5 opacity-75">You answered: {String(feedback.student_answer)}</p>
        ) : null}

        {/* For a choice question the right option is already marked in the
            list above, so repeating it here would only be noise. A written
            answer has nowhere else to show it. */}
        {isFreeText && feedback.correct_answer ? (
          <p className="mt-1.5">
            <span className="font-semibold">Model answer: </span>
            <span className="opacity-90">{String(feedback.correct_answer)}</span>
          </p>
        ) : null}

        {feedback.explanation ? (
          <p className="mt-1.5 opacity-90">{String(feedback.explanation)}</p>
        ) : null}
      </div>
    </div>
  )
}

function findFeedback(result, questionId) {
  if (!result || !Array.isArray(result.results)) return null
  return (
    result.results.find((item) => String(item?.question_id ?? '') === String(questionId)) || null
  )
}

/**
 * Past attempts at this quiz, newest first, each one openable.
 *
 * The score was stored; the per-question verdicts were not. Choice
 * questions are therefore re-compared here - free, and the same string
 * comparison that marked them the first time - while a short answer shows
 * what was written next to the model answer, with no verdict, because
 * re-judging it would be a paid call that could disagree with the mark the
 * student already saw.
 */
function AttemptsTable({ quizId, attempts }) {
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  async function toggleAttempt(attemptId) {
    if (openId === attemptId) {
      setOpenId(null)
      setDetail(null)
      setDetailError(null)
      return
    }

    setOpenId(attemptId)
    setDetail(null)
    setDetailError(null)
    setLoadingDetail(true)
    try {
      setDetail(await getQuizAttempt(quizId, attemptId))
    } catch (err) {
      setDetailError(getErrorMessage(err, 'Could not load this attempt.'))
    } finally {
      setLoadingDetail(false)
    }
  }

  if (!attempts || attempts.length === 0) return null

  return (
    <section className="mb-7">
      <h2 className="type-eyebrow mb-3">Previous attempts</h2>

      {/* A table is the one thing allowed to be wider than the page, so it
          gets its own horizontal scroll instead of pushing the layout. */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="type-micro px-4 py-2.5 font-medium text-muted">
                Attempt
              </th>
              <th scope="col" className="type-micro px-4 py-2.5 font-medium text-muted">
                Score
              </th>
              <th scope="col" className="type-micro px-4 py-2.5 font-medium text-muted">
                Percentage
              </th>
              <th scope="col" className="type-micro px-4 py-2.5 font-medium text-muted">
                Taken
              </th>
              <th scope="col" className="type-micro px-4 py-2.5 font-medium text-muted">
                <span className="sr-only">Answers</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt, index) => (
              <tr key={attempt.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5 tabular-nums text-muted">
                  {attempts.length - index}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-ink">
                  {attempt.score ?? '--'}
                  {attempt.totalQuestions != null ? ` / ${attempt.totalQuestions}` : ''}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-ink">
                  {attempt.percentage != null ? `${Math.round(attempt.percentage)}%` : '--'}
                </td>
                <td className="px-4 py-2.5 text-muted">
                  {formatDateTime(attempt.completedAt) || '--'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleAttempt(attempt.id)}
                    className="type-micro rounded-sm px-2 py-1 font-medium text-muted underline underline-offset-4 transition-colors hover:text-ink"
                  >
                    {openId === attempt.id ? 'Hide answers' : 'View answers'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId ? (
        <div className="mt-3">
          {loadingDetail ? (
            <LoadingState label="Loading your answers" rows={2} />
          ) : detailError ? (
            <InlineError message={detailError} />
          ) : detail ? (
            <AttemptDetail detail={detail} />
          ) : null}
        </div>
      ) : null}

      <p className="type-micro mt-1.5 text-faint">
        Newest first. Choice questions are re-checked here; written answers show
        yours next to the model answer without a mark.
      </p>
    </section>
  )
}

/** One opened attempt: every question, with what was written and what was right. */
function AttemptDetail({ detail }) {
  if (!detail.questions || detail.questions.length === 0) {
    return <p className="type-small text-muted">This attempt recorded no answers.</p>
  }

  return (
    <ol className="space-y-2.5">
      {detail.questions.map((question, index) => {
        const yours = describeAnswer(question, question.studentAnswer)
        const right = describeAnswer(question, question.correctAnswer)

        return (
          <li
            key={question.id}
            className={cx(
              'rounded-sm border bg-surface px-4 py-3',
              question.verdict === 'correct'
                ? 'border-accent-line'
                : question.verdict === 'incorrect'
                  ? 'border-danger-line'
                  : 'border-line',
            )}
          >
            <p className="measure type-small font-medium text-ink">
              <span className="mr-2 text-faint tabular-nums">{index + 1}.</span>
              {question.text}
            </p>

            <div className="type-small mt-2 space-y-1">
              <p className={cx(yours ? 'text-ink' : 'text-faint')}>
                <span className="font-semibold text-muted">You wrote: </span>
                {yours || 'nothing'}
              </p>
              <p className="text-ink">
                <span className="font-semibold text-muted">Correct: </span>
                {right || '--'}
              </p>
              {question.explanation ? (
                <p className="text-muted">{question.explanation}</p>
              ) : null}
            </div>

            {question.verdict == null ? (
              <p className="type-micro mt-2 text-faint">
                Written answer &mdash; the mark it was given at the time is not kept.
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Turn a stored answer into something readable: "B — the frame buffer"
 * rather than "B". Option keys are matched without case, because a choice
 * answer is stored upper-cased while true/false options are keyed in lower
 * case.
 */
function describeAnswer(question, value) {
  if (value == null || String(value).trim() === '') return null

  const raw = String(value).trim()
  const options = question.options

  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const key = Object.keys(options).find(
      (candidate) => candidate.trim().toLowerCase() === raw.toLowerCase(),
    )

    if (key) {
      const text = String(options[key] ?? '')
      return question.type === 'true_false' ? text : `${key} — ${text}`
    }
  }

  return raw
}

function formatDateTime(value) {
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

function ScoreCard({ result, questionCount }) {
  const total = result.totalQuestions ?? questionCount
  const percentage =
    result.percentage ?? (total ? Math.round(((result.score ?? 0) / total) * 100) : null)
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const dash = percentage != null ? (percentage / 100) * circumference : 0

  return (
    <section className="mb-7 rounded-xl border border-line bg-surface px-5 py-5 shadow-raised sm:px-7">
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90" aria-hidden="true">
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="var(--color-sunken)"
              strokeWidth="7"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-semibold tabular-nums">
            {percentage != null ? `${Math.round(percentage)}%` : '--'}
          </span>
        </div>

        <div className="min-w-0">
          <p className="type-eyebrow">Result</p>
          <p className="type-display mt-1">
            {result.score != null && total != null ? `${result.score} of ${total}` : 'Submitted'}
          </p>
          {/* Partial answers earn the mark, so they are named here as well as
              on the question: otherwise a student reading only the score sees
              full credit for an answer that was half of one. */}
          <p className="type-small mt-1.5 text-muted">
            {result.correctCount != null
              ? `${result.correctCount} correct${
                  result.partialCount ? `, ${result.partialCount} partially correct` : ''
                }${
                  result.wrongCount != null ? `, ${result.wrongCount} incorrect` : ''
                }. Per-question results are marked below.`
              : 'Scored by the server. Per-question results are marked below.'}
          </p>
        </div>
      </div>
    </section>
  )
}

/*
 * A NOTE ON THE "PARTIAL" COLOUR
 *
 * The original file used only three tones - accent, danger, neutral - so
 * those are the only ones known to exist here. Partial therefore renders in
 * the neutral grey: distinct from both correct and incorrect, but not
 * coloured.
 *
 * If the design system does have a warning/amber tone, three lines upgrade
 * it, and nothing else changes:
 *
 *   border-line-strong   ->  border-<tone>-line     (QuestionCard border)
 *   'neutral'            ->  '<tone>'               (Badge, add a branch)
 *   bg-sunken text-ink   ->  bg-<tone>-soft text-<tone>   (Feedback)
 */