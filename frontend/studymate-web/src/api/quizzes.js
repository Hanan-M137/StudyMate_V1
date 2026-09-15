import client from './client'

/*
 * Response shapes below were captured from a live StudyMate backend - they are
 * NOT guesses.
 *
 * POST /quizzes
 *   { message, quiz_id, questions_count, warnings }
 *   -> there is no `id` and no `title`; the quiz id is `quiz_id`.
 *   -> `question_types` is a LIST and is respected: the backend is told how
 *      many questions of each type to generate and discards anything else.
 *      It replaced the old singular `question_type`, which the backend
 *      accepted and then ignored - the quiz was always a mix regardless.
 *      Omitting it means all three types. `num_questions` IS respected, and
 *      must be at least as large as the number of types requested.
 *   -> `description` is free text steering generation. It is NOT stored, so
 *      it never comes back from any endpoint.
 *   -> `start_page` / `end_page` restrict generation to part of the PDF, and
 *      are sent both or not at all. They count from the first physical page
 *      of the file, not from the number printed on the page.
 *   -> `warnings` is a list of sentences for the student about what the quiz
 *      did not manage to be - a requested type that produced no questions,
 *      or questions dropped for being the wrong type. It is absent on older
 *      backends and empty when the quiz is exactly what was asked for.
 *
 * GET /quizzes/{quiz_id}
 *   {
 *     quiz:      { id, document_id, title, created_at },
 *     questions: [ { id, question_text, question_type, options, source_page } ]
 *   }
 *   -> `questions` is a SIBLING of `quiz`, not nested inside it.
 *   -> `question_type` varies PER QUESTION and cannot be controlled from the
 *      request. Observed values:
 *        "multiple_choice" -> options = { "A": "...", "B": "...", ... }
 *        "true_false"      -> options = { "true": "True", "false": "False" }
 *        "short_answer"    -> options = null  (free-text answer)
 *   -> correct_answer and explanation are correctly absent before submission.
 *
 * POST /quizzes/{quiz_id}/attempts *   request:  { answers: { "<question_id>": "A", ... } }
 *   response: { message, attempt_id, score, total_questions, percentage,
 *               correct_answers, partial_answers, wrong_answers,
 *               results: [ { question_id, student_answer, correct, verdict,
 *                            reason, correct_answer, explanation } ] }
 *   -> verdict is "correct" | "partial" | "incorrect". Short answers are
 *      judged by the model on meaning rather than compared as strings, so
 *      `reason` explains the mark to the student. It is empty for multiple
 *      choice and true/false, which are still compared as strings.
 *   -> a partial answer earns the mark, so `correct` is true for it and
 *      anything reading only `correct` keeps working.
 *   -> correct_answer and explanation appear ONLY here, after submitting.
 *      GET /quizzes/{quiz_id} still omits both, so they are not readable
 *      before the student answers.
 */

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  TRUE_FALSE: 'true_false',
  SHORT_ANSWER: 'short_answer',
}

/** Human label for any question_type the backend invents, including new ones. */
export function questionTypeLabel(type) {
  if (!type) return 'Question'
  return String(type)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function normaliseQuestion(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null

  const type = String(raw.question_type ?? '').toLowerCase() || 'unknown'

  // options is an object map (A/B/C/D or true/false), or null for short answer.
  let options = []
  if (raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options)) {
    options = Object.entries(raw.options).map(([key, text]) => ({
      key: String(key),
      text: String(text ?? ''),
    }))
  } else if (Array.isArray(raw.options)) {
    options = raw.options.map((text, i) => ({
      key: String.fromCharCode(65 + i),
      text: String(text ?? ''),
    }))
  }

  const id = raw.id ?? raw.question_id ?? null

  /* The backend mixes question types regardless of what was requested, and may
     add new ones. Anything with options renders as a choice list; anything
     without falls back to a free-text answer, so an unknown type degrades
     instead of rendering blank. */
  const isFreeText = type === QUESTION_TYPES.SHORT_ANSWER || options.length === 0

  return {
    id: id != null ? String(id) : `question-${index}`,
    hasRealId: id != null,
    text: raw.question_text ?? raw.question ?? '',
    type,
    typeLabel: questionTypeLabel(raw.question_type),
    isFreeText,
    isKnownType: Object.values(QUESTION_TYPES).includes(type),
    options,
    sourcePage: raw.source_page ?? null,
  }
}

/**
 * POST /quizzes - the title is echoed back from the caller, not the API.
 *
 * `question_types` is a list; omitting it means all three. It replaced the
 * old singular `question_type`, which the backend accepted and ignored.
 * `description` steers generation and is not stored with the quiz.
 *
 * `startPage` / `endPage` are sent as a pair or not at all: the backend
 * refuses half a range rather than assuming what the missing half meant.
 */
export async function createQuiz({
  documentId,
  title,
  numQuestions,
  questionTypes,
  description,
  startPage,
  endPage,
}) {
  const payload = {
    document_id: documentId,
    title,
    num_questions: Number(numQuestions) || 10,
  }

  if (Array.isArray(questionTypes) && questionTypes.length > 0) {
    payload.question_types = questionTypes
  }

  if (description && description.trim()) {
    payload.description = description.trim()
  }

  const first = pageNumberOrNull(startPage)
  const last = pageNumberOrNull(endPage)

  if (first != null && last != null) {
    payload.start_page = first
    payload.end_page = last
  }

  const { data } = await client.post('/quizzes', payload)

  return {
    id: data?.quiz_id != null ? String(data.quiz_id) : null,
    title,
    questionsCount: data?.questions_count ?? null,
    message: data?.message ?? null,
    /* Always an array, so callers can read `.length` without checking: a
       backend that does not send warnings has none to send. */
    warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
  }
}

/** A page number the backend will accept, or null for anything else. */
function pageNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  return parsed
}

/**
 * GET /quizzes -> { quizzes: [ { id, title, is_pinned, document_id,
 *                               document_title, questions_count,
 *                               attempts_count, created_at } ] }
 *
 * Pinned first, then newest first within each group, from the database. This
 * replaced a list kept in the browser's local storage, which was lost on any
 * other device - and the pin lives in the database for the same reason.
 */
export async function listQuizzes() {
  const { data } = await client.get('/quizzes')
  const rows = Array.isArray(data?.quizzes) ? data.quizzes : []

  return rows.map((row) => ({
    id: String(row?.id ?? ''),
    title: row?.title || 'Untitled quiz',
    /* Always a boolean: a backend from before the column existed sends
       nothing, which reads as unpinned rather than as undefined. */
    isPinned: Boolean(row?.is_pinned),
    documentId: row?.document_id ?? null,
    documentTitle: row?.document_title ?? null,
    questionsCount: numberOrNull(row?.questions_count),
    attemptsCount: numberOrNull(row?.attempts_count),
    createdAt: row?.created_at ?? null,
  }))
}

/**
 * PATCH /quizzes/{quiz_id} - JSON { title?, is_pinned? }.
 *   -> { message, quiz: { id, title, is_pinned } }
 *
 * PATCH, not PUT: only the fields being changed are sent, and the questions
 * and attempts are left exactly as they were. Sending neither field is a 400,
 * so the two callers below each send exactly one.
 */
async function patchQuiz(quizId, payload) {
  const { data } = await client.patch(`/quizzes/${quizId}`, payload)
  const quiz = data?.quiz ?? {}

  return {
    id: String(quiz.id ?? quizId),
    title: quiz.title ?? null,
    isPinned: Boolean(quiz.is_pinned),
    message: data?.message ?? null,
  }
}

export async function renameQuiz(quizId, title) {
  const updated = await patchQuiz(quizId, { title })
  return { ...updated, title: updated.title ?? title }
}

/** Pin or unpin, which is what moves the row to the top of its group. */
export async function setQuizPinned(quizId, isPinned) {
  return patchQuiz(quizId, { is_pinned: Boolean(isPinned) })
}

/** DELETE /quizzes/{quiz_id} - also removes its questions and attempts. */
export async function deleteQuiz(quizId) {
  await client.delete(`/quizzes/${quizId}`)
}


export async function getQuiz(quizId) {
  const { data } = await client.get(`/quizzes/${quizId}`)
  const meta = data?.quiz ?? {}
  const rawQuestions = Array.isArray(data?.questions)
    ? data.questions
    : Array.isArray(meta?.questions)
      ? meta.questions
      : []

  return {
    id: String(meta.id ?? quizId),
    title: meta.title ?? 'Untitled quiz',
    documentId: meta.document_id ?? null,
    createdAt: meta.created_at ?? null,
    questions: rawQuestions.map(normaliseQuestion).filter(Boolean),
  }
}

export async function submitQuizAttempt(quizId, answers) {
  const { data } = await client.post(`/quizzes/${quizId}/attempts`, { answers })

  return {
    attemptId: data?.attempt_id ?? null,
    score: numberOrNull(data?.score),
    totalQuestions: numberOrNull(data?.total_questions),
    percentage: numberOrNull(data?.percentage),
    correctCount: numberOrNull(data?.correct_answers),
    partialCount: numberOrNull(data?.partial_answers),
    wrongCount: numberOrNull(data?.wrong_answers),
    results: Array.isArray(data?.results) ? data.results : [],
    raw: data,
  }
}

/**
 * GET /quizzes/{quiz_id}/attempts
 *   { total_questions, attempts: [ { id, score, total_questions,
 *                                    percentage, completed_at } ] }
 *
 * Newest first. Per-question verdicts are not stored, so an attempt
 * carries its score and nothing more.
 */
export async function listQuizAttempts(quizId) {
  const { data } = await client.get(`/quizzes/${quizId}/attempts`)
  const rows = Array.isArray(data?.attempts) ? data.attempts : []

  return rows.map((row) => ({
    id: String(row?.id ?? ''),
    score: numberOrNull(row?.score),
    totalQuestions: numberOrNull(row?.total_questions),
    percentage: numberOrNull(row?.percentage),
    completedAt: row?.completed_at ?? null,
  }))
}
/**
 * GET /quizzes/{quiz_id}/attempts/{attempt_id}
 *   { attempt: {...}, questions: [ { id, question_index, question_text,
 *     question_type, options, student_answer, correct_answer, explanation,
 *     source_page, verdict } ] }
 *
 * `verdict` is "correct" | "incorrect" for multiple choice and true/false,
 * which are re-compared as strings, and null for short answers, whose
 * original verdict was a model judgement and is not stored.
 */
export async function getQuizAttempt(quizId, attemptId) {
  const { data } = await client.get(`/quizzes/${quizId}/attempts/${attemptId}`)
  const meta = data?.attempt ?? {}
  const rows = Array.isArray(data?.questions) ? data.questions : []

  return {
    id: String(meta.id ?? attemptId),
    score: numberOrNull(meta.score),
    totalQuestions: numberOrNull(meta.total_questions),
    percentage: numberOrNull(meta.percentage),
    completedAt: meta.completed_at ?? null,
    questions: rows.map((row, index) => ({
      id: String(row?.id ?? `attempt-question-${index}`),
      text: row?.question_text ?? '',
      type: String(row?.question_type ?? '').toLowerCase(),
      options: row?.options ?? null,
      studentAnswer: row?.student_answer ?? null,
      correctAnswer: row?.correct_answer ?? null,
      explanation: row?.explanation ?? '',
      sourcePage: row?.source_page ?? null,
      verdict: row?.verdict ?? null,
    })),
  }
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}