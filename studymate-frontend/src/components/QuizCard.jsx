import { useState } from "react";

import { submitQuizAttempt } from "../services/api";

function QuizCard({ quiz }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [currentQuestionIndex, setCurrentQuestionIndex] =
    useState(0);

  // =========================================================
  // QUIZ DATA
  // =========================================================

  const quizId = quiz?.id;

  const title = quiz?.title || "Quiz";

  const questions = Array.isArray(quiz?.questions)
    ? quiz.questions
    : [];

  // =========================================================
  // SELECT ANSWER
  // =========================================================

  function handleAnswerChange(questionId, answer) {
    if (result) {
      return;
    }

    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: answer,
    }));

    setError("");
  }

  // =========================================================
  // ANSWER HELPERS
  // =========================================================

  function isUnanswered(question) {
    const value = answers[question.id];

    return (
      !value ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  // =========================================================
  // QUESTION NAVIGATION
  // =========================================================

  const currentQuestion = questions[currentQuestionIndex];

  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion =
    currentQuestionIndex === questions.length - 1;

  function handlePrevious() {
    setCurrentQuestionIndex((previousIndex) =>
      Math.max(0, previousIndex - 1)
    );
  }

  function handleNext() {
    setCurrentQuestionIndex((previousIndex) =>
      Math.min(questions.length - 1, previousIndex + 1)
    );
  }

  // =========================================================
  // SUBMIT QUIZ
  // =========================================================

  async function handleSubmit(event) {
    event.preventDefault();

    if (!quizId) {
      setError("Quiz ID is missing.");
      return;
    }

    if (questions.length === 0) {
      setError("This quiz has no questions.");
      return;
    }

    // Check that all questions have an answer.
    const firstUnansweredIndex = questions.findIndex(
      (question) => isUnanswered(question)
    );

    if (firstUnansweredIndex !== -1) {
      setCurrentQuestionIndex(firstUnansweredIndex);
      setError(
        "Please answer all questions before submitting."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await submitQuizAttempt(
        quizId,
        answers
      );

      setResult(response);
    } catch (error) {
      setError(
        error.message ||
          "Failed to submit the quiz. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // RESET QUIZ
  // =========================================================

  function handleTryAgain() {
    setAnswers({});
    setResult(null);
    setError("");
    setCurrentQuestionIndex(0);
  }

  // =========================================================
  // EMPTY STATE
  // =========================================================

  if (!quiz) {
    return (
      <div className="quiz-card quiz-card-empty">
        <p>No quiz selected.</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="quiz-card quiz-card-empty">
        <h2>{title}</h2>
        <p>This quiz has no questions.</p>
      </div>
    );
  }

  // =========================================================
  // RESULT SCREEN
  // =========================================================

  if (result) {
    return (
      <div className="quiz-card quiz-result">

        <div className="quiz-result-header">
          <h2>Quiz Completed</h2>

          <p>{title}</p>
        </div>

        <div className="quiz-score">
          <strong>
            {result.percentage}%
          </strong>

          <span>
            {result.score} / {result.total_questions}
          </span>
        </div>

        <div className="quiz-result-summary">

          <div>
            <strong>
              {result.correct_answers}
            </strong>

            <span>
              Correct
            </span>
          </div>

          <div>
            <strong>
              {result.wrong_answers}
            </strong>

            <span>
              Wrong
            </span>
          </div>

        </div>

        {/* ===================================================
            QUESTION RESULTS
        ==================================================== */}

        {Array.isArray(result.results) && (
          <div className="quiz-results-list">

            {result.results.map(
              (questionResult, index) => (
                <div
                  key={questionResult.question_id}
                  className={
                    questionResult.correct
                      ? "quiz-result-item correct"
                      : "quiz-result-item incorrect"
                  }
                >
                  <span>
                    Question {index + 1}
                  </span>

                  <strong>
                    {questionResult.correct
                      ? "Correct"
                      : "Incorrect"}
                  </strong>
                </div>
              )
            )}

          </div>
        )}

        <button
          type="button"
          onClick={handleTryAgain}
          className="quiz-retry-button"
        >
          Try Again
        </button>

      </div>
    );
  }

  // =========================================================
  // ANSWER INPUT RENDERING
  // =========================================================

  function renderAnswerInput(question) {
    const options = question.options || {};

    const questionType = (
      question.question_type || "multiple_choice"
    ).toLowerCase();

    if (questionType === "short_answer") {
      const value = answers[question.id] || "";

      return (
        <div className="quiz-options quiz-short-answer">

          <textarea
            value={value}
            onChange={(event) =>
              handleAnswerChange(
                question.id,
                event.target.value
              )
            }
            disabled={Boolean(result)}
            rows={3}
            placeholder="Type your answer..."
          />

        </div>
      );
    }

    const optionKeys =
      questionType === "true_false"
        ? ["true", "false"]
        : ["A", "B", "C", "D"];

    return (
      <div className="quiz-options">

        {optionKeys.map((optionKey) => {

          const optionText = options[optionKey];

          if (!optionText) {
            return null;
          }

          const selected =
            answers[question.id] === optionKey;

          return (
            <label
              key={optionKey}
              className={`quiz-option ${
                selected ? "quiz-option-selected" : ""
              }`}
            >

              <input
                type="radio"
                name={`question-${question.id}`}
                value={optionKey}
                checked={selected}
                onChange={() =>
                  handleAnswerChange(
                    question.id,
                    optionKey
                  )
                }
              />

              {questionType !== "true_false" && (
                <span className="quiz-option-letter">
                  {optionKey}
                </span>
              )}

              <span className="quiz-option-text">
                {optionText}
              </span>

            </label>
          );
        })}

      </div>
    );
  }

  // =========================================================
  // QUIZ FORM
  // =========================================================

  return (
    <div className="quiz-card">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="quiz-card-header">

        <div>
          <h2>{title}</h2>

          <p>
            {questions.length}{" "}
            {questions.length === 1
              ? "question"
              : "questions"}
          </p>
        </div>

      </div>

      {/* =====================================================
          ERROR
      ====================================================== */}

      {error && (
        <div
          className="form-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* =====================================================
          QUESTIONS
      ====================================================== */}

      <form onSubmit={handleSubmit}>

        {/* ===================================================
            PROGRESS
        ==================================================== */}

        <div className="quiz-progress">

          <p>
            Question {currentQuestionIndex + 1} of{" "}
            {questions.length}
          </p>

          <div
            className="quiz-progress-track"
            style={{
              background: "#e5e7eb",
              borderRadius: "9999px",
              height: "8px",
              overflow: "hidden",
            }}
          >
            <div
              className="quiz-progress-fill"
              style={{
                width: `${
                  ((currentQuestionIndex + 1) /
                    questions.length) *
                  100
                }%`,
                background: "#6366f1",
                height: "100%",
              }}
            />
          </div>

        </div>

        <div className="quiz-questions">

          {currentQuestion && (
            <div
              key={currentQuestion.id}
              className="quiz-question"
            >

              {/* Question */}

              <div className="quiz-question-header">

                <span>
                  Question {currentQuestionIndex + 1}
                </span>

                <h3>
                  {currentQuestion.question_text}
                </h3>

              </div>

              {/* Answer input */}

              {renderAnswerInput(currentQuestion)}

            </div>
          )}

        </div>

        {/* ===================================================
            NAVIGATION / SUBMIT
        ==================================================== */}

        <div className="quiz-submit quiz-nav">

          <button
            type="button"
            onClick={handlePrevious}
            disabled={isFirstQuestion}
          >
            Previous
          </button>

          {isLastQuestion ? (
            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Submitting..."
                : "Submit Quiz"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
            >
              Next
            </button>
          )}

        </div>

      </form>

    </div>
  );
}

export default QuizCard;