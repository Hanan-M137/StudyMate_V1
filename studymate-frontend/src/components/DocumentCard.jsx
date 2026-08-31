import { useNavigate } from "react-router-dom";

function DocumentCard({
  document,
  onDelete,
  deleting = false,
}) {
  const navigate = useNavigate();

  // =========================================================
  // DOCUMENT DATA
  // =========================================================

  const documentId = document?.id;
  const title = document?.title || "Untitled Document";
  const filename = document?.filename || "Unknown file";
  const status = document?.status || "unknown";

  // =========================================================
  // STATUS
  // =========================================================

  function getStatusLabel() {
    switch (status.toLowerCase()) {
      case "processing":
        return "Processing";

      case "completed":
        return "Ready";

      case "ready":
        return "Ready";

      case "failed":
        return "Failed";

      case "pending":
        return "Pending";

      default:
        return status;
    }
  }

  function getStatusClass() {
    switch (status.toLowerCase()) {
      case "processing":
        return "status-processing";

      case "completed":
      case "ready":
        return "status-ready";

      case "failed":
        return "status-failed";

      case "pending":
        return "status-pending";

      default:
        return "status-unknown";
    }
  }

  // =========================================================
  // ACTIONS
  // =========================================================

  function handleOpenDocument() {
    if (!documentId) {
      return;
    }

    /*
      For now, open the Chat page with the selected
      document ID.

      The Chat page will later use this ID to send
      questions to the RAG backend.
    */
    navigate(`/chat?document=${documentId}`);
  }

  function handleDelete() {
    if (!documentId || deleting) {
      return;
    }

    onDelete(documentId);
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <article className="document-card">

      {/* =====================================================
          DOCUMENT ICON
      ====================================================== */}

      <div className="document-card-icon">
        <span>PDF</span>
      </div>

      {/* =====================================================
          DOCUMENT INFORMATION
      ====================================================== */}

      <div className="document-card-content">

        <h3
          className="document-card-title"
          title={title}
        >
          {title}
        </h3>

        <p
          className="document-card-filename"
          title={filename}
        >
          {filename}
        </p>

        {/* ===================================================
            STATUS
        ==================================================== */}

        <div className="document-card-status">

          <span
            className={`document-status ${getStatusClass()}`}
          >
            {getStatusLabel()}
          </span>

        </div>

      </div>

      {/* =====================================================
          ACTIONS
      ====================================================== */}

      <div className="document-card-actions">

        <button
          type="button"
          onClick={handleOpenDocument}
          disabled={
            !documentId ||
            deleting ||
            status.toLowerCase() === "processing"
          }
        >
          Open
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!documentId || deleting}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>

      </div>

    </article>
  );
}

export default DocumentCard;