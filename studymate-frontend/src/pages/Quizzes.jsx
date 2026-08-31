import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getDocuments,
  createQuiz,
  getQuiz,
} from "../services/api";

import QuizCard from "../components/QuizCard";


function Quizzes() {
  const navigate = useNavigate();

  // =========================================================
  // STATE
  // =========================================================

  const [documents, setDocuments] = useState([]);

  const [selectedDocumentId, setSelectedDocumentId] =
    useState("");

  const [quiz, setQuiz] = useState(null);

  const [quizTitle, setQuizTitle] =
    useState("Study Quiz");

  const [numQuestions, setNumQuestions] =
    useState(10);

  const [loadingDocuments, setLoadingDocuments] =
    useState(true);

  const [creatingQuiz, setCreatingQuiz] =
    useState(false);

  const [loadingQuiz, setLoadingQuiz] =
    useState(false);

  const [error, setError] = useState("");

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  useEffect(() => {
    async function loadDocuments() {
      setLoadingDocuments(true);
      setError("");

      try {
        const data = await getDocuments();

        const documentList = Array.isArray(data)
          ? data
          : [];

        setDocuments(documentList);

        // Select the first ready document automatically.
        const readyDocument = documentList.find(
          (document) =>
            document.status === "ready" ||
            document.status === "completed"
        );

        if (readyDocument) {
          setSelectedDocumentId(
            String(readyDocument.id)
          );
        }

      } catch (error) {
        setError(
          error.message ||
            "Failed to load your documents."
        );
      } finally {
        setLoadingDocuments(false);
      }
    }

    loadDocuments();
  }, []);

  // =========================================================
  // CREATE QUIZ
  // =========================================================

  async function handleCreateQuiz(event) {
    event.preventDefault();

    if (!selectedDocumentId) {
      setError(
        "Please select a document first."
      );
      return;
    }

    if (
      numQuestions < 1 ||
      numQuestions > 50
    ) {
      setError(
        "Number of questions must be between 1 and 50."
      );
      return;
    }

    setCreatingQuiz(true);
    setError("");
    setQuiz(null);

    try {
      const response = await createQuiz({
        documentId: selectedDocumentId,
        title: quizTitle.trim() || "Study Quiz",
        numQuestions: Number(numQuestions),
        questionType: "multiple_choice",
      });

      if (!response?.quiz_id) {
        throw new Error(
          "The backend did not return a quiz ID."
        );
      }

      // Load the complete quiz.
      setLoadingQuiz(true);

      const createdQuiz = await getQuiz(
        response.quiz_id
      );

      setQuiz(createdQuiz);

    } catch (error) {
      setError(
        error.message ||
          "Failed to create the quiz."
      );
    } finally {
      setCreatingQuiz(false);
      setLoadingQuiz(false);
    }
  }

  // =========================================================
  // RESET
  // =========================================================

  function handleNewQuiz() {
    setQuiz(null);
    setError("");
  }

  // =========================================================
  // READY DOCUMENTS
  // =========================================================

  const readyDocuments = documents.filter(
    (document) =>
      document.status === "ready" ||
      document.status === "completed"
  );

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="quizzes-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="quizzes-header">

        <div>
          <h1>AI Quizzes</h1>

          <p>
            Test your knowledge using questions
            generated from your study documents.
          </p>
        </div>

        {quiz && (
          <button
            type="button"
            onClick={handleNewQuiz}
          >
            New Quiz
          </button>
        )}

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
          LOADING DOCUMENTS
      ====================================================== */}

      {loadingDocuments && (
        <div className="quizzes-loading">
          Loading your documents...
        </div>
      )}

      {/* =====================================================
          NO DOCUMENTS
      ====================================================== */}

      {!loadingDocuments &&
        readyDocuments.length === 0 && (
          <div className="quiz-no-documents">

            <h2>
              No ready documents
            </h2>

            <p>
              Upload and process a PDF before
              creating a quiz.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/documents")
              }
            >
              Upload a Document
            </button>

          </div>
        )}

      {/* =====================================================
          QUIZ GENERATOR
      ====================================================== */}

      {!quiz &&
        !loadingDocuments &&
        readyDocuments.length > 0 && (

          <section className="quiz-generator">

            <div className="quiz-generator-header">

              <h2>
                Create a Quiz
              </h2>

              <p>
                Choose a document and let StudyMate
                generate multiple-choice questions.
              </p>

            </div>

            <form
              onSubmit={handleCreateQuiz}
              className="quiz-generator-form"
            >

              {/* Document */}

              <div className="form-group">

                <label htmlFor="quiz-document">
                  Study Document
                </label>

                <select
                  id="quiz-document"
                  value={selectedDocumentId}
                  onChange={(event) =>
                    setSelectedDocumentId(
                      event.target.value
                    )
                  }
                  disabled={creatingQuiz}
                >

                  <option value="">
                    Select a document
                  </option>

                  {readyDocuments.map(
                    (document) => (
                      <option
                        key={document.id}
                        value={document.id}
                      >
                        {document.title ||
                          document.filename ||
                          "Untitled Document"}
                      </option>
                    )
                  )}

                </select>

              </div>

              {/* Title */}

              <div className="form-group">

                <label htmlFor="quiz-title">
                  Quiz Title
                </label>

                <input
                  id="quiz-title"
                  type="text"
                  value={quizTitle}
                  onChange={(event) =>
                    setQuizTitle(
                      event.target.value
                    )
                  }
                  placeholder="Study Quiz"
                  disabled={creatingQuiz}
                />

              </div>

              {/* Number of Questions */}

              <div className="form-group">

                <label htmlFor="num-questions">
                  Number of Questions
                </label>

                <input
                  id="num-questions"
                  type="number"
                  min="1"
                  max="50"
                  value={numQuestions}
                  onChange={(event) =>
                    setNumQuestions(
                      event.target.value
                    )
                  }
                  disabled={creatingQuiz}
                />

              </div>

              {/* Submit */}

              <button
                type="submit"
                disabled={
                  creatingQuiz ||
                  !selectedDocumentId
                }
              >
                {creatingQuiz
                  ? "Generating Quiz..."
                  : "Generate Quiz"}
              </button>

            </form>

          </section>
        )}

      {/* =====================================================
          LOADING QUIZ
      ====================================================== */}

      {loadingQuiz && (
        <div className="quizzes-loading">
          Loading your quiz...
        </div>
      )}

      {/* =====================================================
          QUIZ
      ====================================================== */}

      {quiz && !loadingQuiz && (
        <section className="quiz-section">

          <QuizCard
            quiz={quiz}
          />

        </section>
      )}

    </div>
  );
}

export default Quizzes;