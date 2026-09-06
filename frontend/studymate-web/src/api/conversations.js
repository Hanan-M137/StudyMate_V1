import client from './client'

/*
 * Response shapes below were captured from a live StudyMate backend
 * (FastAPI, /conversations) - they are NOT guesses.
 *
 * GET /conversations
 *   [ { id, user_id, document_id, title, created_at } ]
 *   `title` is the text of the first user message.
 *
 * GET /conversations/{id}
 *   {
 *     conversation: { id, user_id, document_id, title, created_at },
 *     messages: [
 *       { id, conversation_id, role: "user"|"assistant", content,
 *         sources: [ { chunk_id, content, page_number, similarity } ],
 *         created_at }
 *     ]
 *   }
 *   Note: `messages` is a SIBLING of `conversation`, not nested inside it.
 *
 * The optional chaining below is defensive only; the field names are verified.
 */

export function normaliseConversation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id ?? raw.conversation_id ?? null
  return {
    id: id != null ? String(id) : null,
    title: raw.title ?? null,
    documentId: raw.document_id ?? null,
    createdAt: raw.created_at ?? null,
  }
}

export function normaliseMessage(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null
  const role = String(raw.role ?? '').toLowerCase() === 'user' ? 'user' : 'assistant'
  return {
    id: String(raw.id ?? `msg-${index}`),
    role,
    content: raw.content ?? '',
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    createdAt: raw.created_at ?? null,
  }
}

export async function listConversations() {
  const { data } = await client.get('/conversations')
  const rows = Array.isArray(data) ? data : (data?.conversations ?? [])
  return rows.map(normaliseConversation).filter(Boolean)
}

export async function getConversation(conversationId) {
  const { data } = await client.get(`/conversations/${conversationId}`)

  const meta = normaliseConversation(data?.conversation ?? data) || {
    id: String(conversationId),
    title: null,
    documentId: null,
    createdAt: null,
  }

  const rawMessages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data?.conversation?.messages)
      ? data.conversation.messages
      : []

  return {
    ...meta,
    id: meta.id ?? String(conversationId),
    messages: rawMessages.map(normaliseMessage).filter(Boolean),
  }
}
