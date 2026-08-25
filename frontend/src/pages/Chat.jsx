import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import {
  getDocuments,
  getConversations,
} from "../services/api";

import ChatBox from "../components/ChatBox";

function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const documentIdFromUrl = searchParams.get("document");

  const [documents, setDocuments] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] =
    useState(documentIdFromUrl || "");

  const [conversations, setConversations] = useState([]);

  const [loadingDocuments, setLoadingDocuments] =
    useState(true);

  const [loadingConversations, setLoadingConversations] =
    useState(true);

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

        /*
          If there is no document selected from the URL,
          automatically select the first available document.
        */
        if (
          !documentIdFromUrl &&
          documentList.length > 0
        ) {
          setSelectedDocumentId(
            String(documentList[0].id)
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
  }, [documentIdFromUrl]);

  // =========================================================
  // LOAD CONVERSATIONS
  // =========================================================

  useEffect(() => {
    async function loadConversations() {
      setLoadingConversations(true);

      try {
        const data = await getConversations();

        setConversations(
          Array.isArray(data) ? data : []
        );
      } catch (error) {
        /*
          Conversations are not required for the first
          chat screen, so we don't replace the entire page
          with an error if this request fails.
        */
        console.error(
          "Failed to load conversations:",
          error
        );
      } finally {
        setLoadingConversations(false);
      }
    }

    loadConversations();
  }, []);

  // =========================================================
  // DOCUMENT SELECTION
  // =========================================================

  function handleDocumentChange(event) {
    const documentId = event.target.value;

    setSelectedDocumentId(documentId);

    /*
      Keep the selected document in the URL.

      Example:
      /chat?document=123
    */
    if (documentId) {
      navigate(
        `/chat?document=${documentId}`,
        { replace: true }
      );
    }
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="chat-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="chat-header">

        <div>
          <h1>AI Study Chat</h1>

          <p>
            Ask questions about your uploaded study
            documents.
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
          DOCUMENT SELECTOR
      ====================================================== */}

      <section className="chat-document-selector">

        <label htmlFor="chat-document">
          Select a document
        </label>

        {loadingDocuments ? (
          <p>
            Loading documents...
          </p>
        ) : documents.length === 0 ? (
          <div className="chat-no-documents">

            <p>
              You don't have any documents yet.
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
        ) : (
          <select
            id="chat-document"
            value={selectedDocumentId}
            onChange={handleDocumentChange}
          >
            <option value="">
              Select a document
            </option>

            {documents.map((document) => (
              <option
                key={document.id}
                value={document.id}
              >
                {document.title ||
                  document.filename ||
                  "Untitled Document"}
              </option>
            ))}
          </select>
        )}

      </section>

      {/* =====================================================
          CHAT
      ====================================================== */}

      {selectedDocumentId && (
        <section className="chat-section">

          <ChatBox
            documentId={selectedDocumentId}
          />

        </section>
      )}

      {/* =====================================================
          CONVERSATIONS
      ====================================================== */}

      {selectedDocumentId &&
        conversations.length > 0 && (
          <section className="chat-conversations">

            <div className="chat-conversations-header">

              <h2>
                Previous Conversations
              </h2>

              {loadingConversations && (
                <span>
                  Loading...
                </span>
              )}

            </div>

            <div className="conversation-list">

              {conversations.map(
                (conversation) => (
                  <div
                    key={conversation.id}
                    className="conversation-item"
                  >

                    <strong>
                      {conversation.title ||
                        "Conversation"}
                    </strong>

                  </div>
                )
              )}

            </div>

          </section>
        )}

    </div>
  );
}

export default Chat;