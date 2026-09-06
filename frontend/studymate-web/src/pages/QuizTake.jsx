import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getQuiz, submitQuizAttempt } from '../api/quizzes'
import { getErrorMessage } from '../lib/errors'
import { rememberQuiz } from './Quizzes'
import { CheckIcon, CloseIcon } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineError,
  Input,
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setAnswers({})
    try {
      const loaded = await getQuiz(quizId)
      setQuiz(loaded)
      rememberQuiz(loaded)
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
  const state = feedback ? (feedback.correct ? 'correct' : 'incorrect') : 'neutral'

  return (
    <Card
      as="fieldset"
      disabled={locked}
      className={cx(
        'px-4 py-4 sm:px-6 sm:py-5',
        state === 'correct' && 'border-accent-line',
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
        <Badge tone={state === 'incorrect' ? 'danger' : state === 'correct' ? 'accent' : 'neutral'}>
          {question.typeLabel}
        </Badge>
      </div>

      {question.isFreeText ? (
        <div className="measure">
          <label htmlFor={`answer-${question.id}`} className="sr-only">
            Your answer
          </label>
          <Input
            id={`answer-${question.id}`}
            value={value}
            disabled={locked}
            placeholder="Type your answer"
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="type-micro mt-1.5 text-faint">
            {question.isKnownType
              ? 'Compared as plain text, so match the document’s wording (for example 12000, not 12,000).'
              : 'This question type was not recognised, so it accepts a free-text answer.'}
          </p>
        </div>
      ) : (
        <div className="measure space-y-2" role="radiogroup" aria-label={question.text || 'Options'}>
          {question.options.map((option) => {
            const selected = value === option.key
            return (
              <label
                key={option.key}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-sm border px-3.5 py-2.5 transition-colors duration-150',
                  selected
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
                </span>
              </label>
            )
          })}
        </div>
      )}

      {question.sourcePage != null ? (
        <p className="type-micro mt-3 text-faint">From page {question.sourcePage}</p>
      ) : null}

      {feedback ? <Feedback feedback={feedback} /> : null}
    </Card>
  )
}

/** results entries are { question_id, student_answer, correct }. */
function Feedback({ feedback }) {
  const isCorrect = feedback.correct === true
  return (
    <div
      className={cx(
        'mt-4 flex items-start gap-2.5 rounded-sm px-3.5 py-2.5',
        isCorrect ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger',
      )}
    >
      {isCorrect ? (
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CloseIcon className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="type-small">
        <p className="font-semibold">{isCorrect ? 'Correct' : 'Incorrect'}</p>
        {feedback.student_answer != null ? (
          <p className="opacity-90">You answered: {String(feedback.student_answer)}</p>
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
          <p className="type-small mt-1.5 text-muted">
            {result.correctCount != null
              ? `${result.correctCount} correct${
                  result.wrongCount != null ? `, ${result.wrongCount} incorrect` : ''
                }. Per-question results are marked below.`
              : 'Scored by the server. Per-question results are marked below.'}
          </p>
        </div>
      </div>
    </section>
  )
}
