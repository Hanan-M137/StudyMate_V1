import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getDocuments } from "../services/api";

function Dashboard() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      setError("");

      try {
        const data = await getDocuments();

        setDocuments(Array.isArray(data) ? data : []);
      } catch (error) {
        setError(
          error.message ||
            "Failed to load dashboard data."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // =========================================================
  // DOCUMENT STATISTICS
  // =========================================================

  const totalDocuments = documents.length;

  const readyDocuments = documents.filter(
    (document) => {
      const status = document?.status?.toLowerCase();

      return (
        status === "ready" ||
        status === "completed"
      );
    }
  ).length;

  const processingDocuments = documents.filter(
    (document) =>
      document?.status?.toLowerCase() === "processing"
  ).length;

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="dashboard-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="dashboard-header">

        <div>
          <h1>Welcome to StudyMate</h1>

          <p>
            Your personal study space for documents,
            AI questions, and quizzes.
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
          STATISTICS
      ====================================================== */}

      <section className="dashboard-stats">

        <div className="stat-card">

          <span className="stat-card-label">
            Documents
          </span>

          <strong className="stat-card-value">
            {loading ? "..." : totalDocuments}
          </strong>

        </div>

        <div className="stat-card">

          <span className="stat-card-label">
            Ready
          </span>

          <strong className="stat-card-value">
            {loading ? "..." : readyDocuments}
          </strong>

        </div>

        <div className="stat-card">

          <span className="stat-card-label">
            Processing
          </span>

          <strong className="stat-card-value">
            {loading ? "..." : processingDocuments}
          </strong>

        </div>

      </section>

      {/* =====================================================
          QUICK ACTIONS
      ====================================================== */}

      <section className="dashboard-section">

        <div className="dashboard-section-header">

          <h2>
            Quick Actions
          </h2>

        </div>

        <div className="dashboard-actions">

          <button
            type="button"
            onClick={() => navigate("/documents")}
          >
            <strong>
              My Documents
            </strong>

            <span>
              Upload and manage your study PDFs.
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/quizzes")}
          >
            <strong>
              Quizzes
            </strong>

            <span>
              Practice what you have learned.
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/chat")}
          >
            <strong>
              AI Chat
            </strong>

            <span>
              Ask questions about your documents.
            </span>
          </button>

        </div>

      </section>

      {/* =====================================================
          RECENT DOCUMENTS
      ====================================================== */}

      <section className="dashboard-section">

        <div className="dashboard-section-header">

          <h2>
            Recent Documents
          </h2>

          <button
            type="button"
            onClick={() => navigate("/documents")}
          >
            View All
          </button>

        </div>

        {loading && (
          <div className="dashboard-loading">
            Loading documents...
          </div>
        )}

        {!loading &&
          documents.length === 0 && (
            <div className="dashboard-empty">

              <h3>
                No documents yet
              </h3>

              <p>
                Upload your first PDF to start
                studying with StudyMate.
              </p>

              <button
                type="button"
                onClick={() => navigate("/documents")}
              >
                Upload Document
              </button>

            </div>
          )}

        {!loading &&
          documents.length > 0 && (
            <div className="recent-documents">

              {documents
                .slice(0, 5)
                .map((document) => (
                  <div
                    key={document.id}
                    className="recent-document"
                  >

                    <div>
                      <strong>
                        {document.title ||
                          "Untitled Document"}
                      </strong>

                      <span>
                        {document.filename ||
                          "Unknown file"}
                      </span>
                    </div>

                    <span
                      className={`document-status ${
                        document.status
                          ? `status-${document.status.toLowerCase()}`
                          : "status-unknown"
                      }`}
                    >
                      {document.status ||
                        "Unknown"}
                    </span>

                  </div>
                ))}

            </div>
          )}

      </section>

    </div>
  );
}

export default Dashboard;