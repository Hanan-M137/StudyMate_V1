import client from './client'

/*
 * Response shapes below were captured from a live StudyMate backend - they are
 * NOT guesses.
 *
 * POST /quizzes
 *   { message, quiz_id, questions_count }
 *   -> there is no `id` and no `title`; the quiz id is `quiz_id`.
 *   -> `question_type` is OPTIONAL in the spec (required is ["document_id",
 *      "title"]) and the backend ignores it anyway - it always generates a mix.
 *      It is therefore not sent at all. `num_questions` IS respected.
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
 * POST /quizzes/{quiz_id}/attempts
 *   request:  { answers: { "<question_id>": "A", ... } }
 *   response: { message, attempt_id, score, total_questions, percentage,
 *               correct_answers, wrong_answers,
 *               results: [ { question_id, student_answer, correct } ] }
 *   -> results carry no correct_answer/explanation, only right/wrong.
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

/** POST /quizzes - the title is echoed back from the caller, not the API. */
export async function createQuiz({ documentId, title, numQuestions }) {
  const { data } = await client.post('/quizzes', {
    document_id: documentId,
    title,
    num_questions: Number(numQuestions) || 10,
  })

  return {
    id: data?.quiz_id != null ? String(data.quiz_id) : null,
    title,
    questionsCount: data?.questions_count ?? null,
    message: data?.message ?? null,
  }
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
    wrongCount: numberOrNull(data?.wrong_answers),
    results: Array.isArray(data?.results) ? data.results : [],
    raw: data,
  }
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return null
}
