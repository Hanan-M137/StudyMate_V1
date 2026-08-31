import { useEffect, useState } from "react";

import {
  getConversation,
  sendChatMessage,
} from "../services/api";

function ChatBox({
  documentId,
  conversationId = null,
  onConversationStart,
}) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const [internalConversationId, setInternalConversationId] =
    useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] =
    useState(false);
  const [error, setError] = useState("");

  // =========================================================
  // LOAD CONVERSATION HISTORY
  // =========================================================

  useEffect(() => {
    async function loadHistory() {
      if (!conversationId) {
        setMessages([]);
        setInternalConversationId(null);
        return;
      }

      setLoadingHistory(true);
      setError("");

      try {
        const data = await getConversation(conversationId);

        const loadedMessages = Array.isArray(
          data?.messages
        )
          ? data.messages.map((historyMessage) => ({
              id: historyMessage.id,
              role: historyMessage.role,
              content: historyMessage.content,
              sources: [],
            }))
          : [];

        setMessages(loadedMessages);
        setInternalConversationId(conversationId);
      } catch (error) {
        setError(
          error.message ||
            "Failed to load this conversation."
        );
      } finally {
        setLoadingHistory(false);
      }
    }

    loadHistory();
  }, [conversationId]);

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return;
    }

    if (!documentId) {
      setError(
        "Please select a document before asking a question."
      );
      return;
    }

    setError("");

    // Add user's message immediately to the chat.
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmedMessage,
    };

    setMessages((previousMessages) => [
      ...previousMessages,
      userMessage,
    ]);

    setMessage("");
    setLoading(true);

    try {
      const response = await sendChatMessage({
        documentId,
        message: trimmedMessage,
        conversationId: internalConversationId,
      });

      /*
        The backend may return the conversation ID
        after creating a new conversation.
      */
      if (response?.conversation_id) {
        setInternalConversationId(
          response.conversation_id
        );
        onConversationStart?.(
          response.conversation_id
        );
      }

      /*
        Different backend response formats can be handled
        here without breaking the chat UI.

        The expected answer is normally:
          response.answer
      */
      const answer =
        response?.answer ||
        response?.response ||
        response?.message ||
        "The AI did not return an answer.";

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: answer,

        /*
          If the backend returns sources or references,
          keep them with the message so they can be
          displayed later.
        */
        sources:
          response?.sources ||
          response?.references ||
          [],
      };

      setMessages((previousMessages) => [
        ...previousMessages,
        assistantMessage,
      ]);
    } catch (error) {
      setError(
        error.message ||
          "Failed to get an answer. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // HANDLE ENTER KEY
  // =========================================================

  function handleKeyDown(event) {
    /*
      Enter sends the message.

      Shift + Enter creates a new line.
    */
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (!loading) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  // =========================================================
  // CLEAR CHAT
  // =========================================================

  function handleClearChat() {
    if (loading) {
      return;
    }

    setMessages([]);
    setInternalConversationId(null);
    setError("");
    onConversationStart?.(null);
  }

  // =========================================================
  // RENDER MESSAGE
  // =========================================================

  function renderMessage(messageItem) {
    const isUser =
      messageItem.role === "user";

    return (
      <div
        key={messageItem.id}
        className={`chat-message ${
          isUser
            ? "chat-message-user"
            : "chat-message-assistant"
        }`}
      >

        <div className="chat-message-role">
          {isUser ? "You" : "StudyMate"}
        </div>

        <div className="chat-message-content">
          {messageItem.content}
        </div>

        {/* ===================================================
            SOURCES
        ==================================================== */}

        {!isUser &&
          messageItem.sources &&
          messageItem.sources.length > 0 && (
            <div className="chat-message-sources">

              <strong>
                Sources
              </strong>

              <ul>
                {messageItem.sources.map(
                  (source, index) => (
                    <li key={index}>

                      {typeof source === "string"
                        ? source
                        : source?.title ||
                          source?.filename ||
                          `Source ${index + 1}`}

                    </li>
                  )
                )}
              </ul>

            </div>
          )}

      </div>
    );
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="chat-box">

      {/* =====================================================
          CHAT HEADER
      ====================================================== */}

      <div className="chat-box-header">

        <div>
          <h2>
            Ask StudyMate
          </h2>

          <p>
            Ask questions based on the selected
            document.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClearChat}
            disabled={loading}
          >
            Clear Chat
          </button>
        )}

      </div>

      {/* =====================================================
          MESSAGES
      ====================================================== */}

      <div className="chat-messages">

        {loadingHistory && (
          <div className="chat-empty">
            <p>Loading conversation...</p>
          </div>
        )}

        {!loadingHistory &&
          messages.length === 0 &&
          !loading && (
          <div className="chat-empty">

            <h3>
              Start a conversation
            </h3>

            <p>
              Ask StudyMate a question about your
              selected document.
            </p>

          </div>
        )}

        {messages.map(renderMessage)}

        {/* ===================================================
            LOADING MESSAGE
        ==================================================== */}

        {loading && (
          <div className="chat-message chat-message-assistant">

            <div className="chat-message-role">
              StudyMate
            </div>

            <div className="chat-message-content">
              Thinking...
            </div>

          </div>
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
          MESSAGE INPUT
      ====================================================== */}

      <form
        className="chat-input-form"
        onSubmit={handleSubmit}
      >

        <textarea
          value={message}
          onChange={(event) =>
            setMessage(event.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your document..."
          rows={3}
          disabled={loading || !documentId}
        />

        <button
          type="submit"
          disabled={
            loading ||
            !documentId ||
            !message.trim()
          }
        >
          {loading ? "Sending..." : "Send"}
        </button>

      </form>

      {/* =====================================================
          INPUT HINT
      ====================================================== */}

      <div className="chat-input-hint">
        Press Enter to send. Use Shift + Enter for a
        new line.
      </div>

    </div>
  );
}

export default ChatBox;