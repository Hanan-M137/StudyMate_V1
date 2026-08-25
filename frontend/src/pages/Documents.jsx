import { useEffect, useRef, useState } from "react";

import {
  getDocuments,
  uploadDocument,
  deleteDocument,
} from "../services/api";

import DocumentCard from "../components/DocumentCard";

function Documents() {
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  async function loadDocuments() {
    setLoading(true);
    setError("");

    try {
      const data = await getDocuments();

      /*
        The backend may return the documents directly as an array.
      */
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      setError(
        error.message ||
          "Failed to load your documents. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Load documents when the page opens.
  useEffect(() => {
    loadDocuments();
  }, []);

  // =========================================================
  // FILE SELECTION
  // =========================================================

  function handleFileChange(event) {
    setError("");
    setSuccess("");

    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // StudyMate currently works with PDF documents.
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Please select a PDF file.");
      setSelectedFile(null);

      // Reset file input so the same invalid file can be selected again.
      event.target.value = "";

      return;
    }

    setSelectedFile(file);
  }

  // =========================================================
  // OPEN FILE SELECTOR
  // =========================================================

  function handleChooseFile() {
    setError("");
    setSuccess("");

    fileInputRef.current?.click();
  }

  // =========================================================
  // UPLOAD DOCUMENT
  // =========================================================

  async function handleUpload() {
    if (!selectedFile) {
      setError("Please select a PDF file first.");
      return;
    }

    setError("");
    setSuccess("");
    setUploading(true);

    try {
      const newDocument = await uploadDocument(selectedFile);

      /*
        Add the returned document to the beginning of the list.

        This avoids making another GET request after upload.
      */
      if (newDocument) {
        setDocuments((previousDocuments) => [
          newDocument,
          ...previousDocuments,
        ]);
      } else {
        // Fallback in case the backend doesn't return the document.
        await loadDocuments();
      }

      setSelectedFile(null);

      // Reset the file input.
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setSuccess("Document uploaded successfully.");
    } catch (error) {
      setError(
        error.message ||
          "Failed to upload the document. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  // =========================================================
  // DELETE DOCUMENT
  // =========================================================

  async function handleDelete(documentId) {
    if (!documentId) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this document?"
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingId(documentId);

    try {
      await deleteDocument(documentId);

      setDocuments((previousDocuments) =>
        previousDocuments.filter(
          (document) => document.id !== documentId
        )
      );

      setSuccess("Document deleted successfully.");
    } catch (error) {
      setError(
        error.message ||
          "Failed to delete the document. Please try again."
      );
    } finally {
      setDeletingId(null);
    }
  }

  // =========================================================
  // FORMAT FILE SIZE
  // =========================================================

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) {
      return "";
    }

    const units = ["B", "KB", "MB", "GB"];

    const index = Math.floor(
      Math.log(bytes) / Math.log(1024)
    );

    const unitIndex = Math.min(index, units.length - 1);

    const size = bytes / Math.pow(1024, unitIndex);

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="documents-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="documents-header">
        <div>
          <h1>My Documents</h1>

          <p>
            Upload and manage the documents you want to
            study with StudyMate.
          </p>
        </div>
      </div>

      {/* =====================================================
          UPLOAD SECTION
      ====================================================== */}

      <section className="upload-section">

        <div className="upload-content">

          <h2>Upload a document</h2>

          <p>
            Upload a PDF and StudyMate will process it so you
            can ask questions and generate quizzes from it.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
            hidden
          />

          <div className="upload-actions">

            <button
              type="button"
              onClick={handleChooseFile}
              disabled={uploading}
            >
              Choose PDF
            </button>

            {selectedFile && (
              <span className="selected-file">
                {selectedFile.name}

                {selectedFile.size > 0 && (
                  <> ({formatFileSize(selectedFile.size)})</>
                )}
              </span>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>

          </div>

        </div>

      </section>

      {/* =====================================================
          MESSAGES
      ====================================================== */}

      {error && (
        <div
          className="form-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="form-success"
          role="status"
        >
          {success}
        </div>
      )}

      {/* =====================================================
          DOCUMENTS LIST
      ====================================================== */}

      <section className="documents-list-section">

        <div className="documents-list-header">
          <h2>Your Documents</h2>

          {!loading && (
            <span>
              {documents.length}{" "}
              {documents.length === 1
                ? "document"
                : "documents"}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="documents-loading">
            Loading your documents...
          </div>
        )}

        {/* Empty state */}
        {!loading && documents.length === 0 && !error && (
          <div className="documents-empty">
            <h3>No documents yet</h3>

            <p>
              Upload your first PDF to start studying with
              StudyMate.
            </p>
          </div>
        )}

        {/* Documents */}
        {!loading && documents.length > 0 && (
          <div className="documents-grid">
            {documents.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                onDelete={handleDelete}
                deleting={deletingId === document.id}
              />
            ))}
          </div>
        )}

      </section>

    </div>
  );
}

export default Documents;