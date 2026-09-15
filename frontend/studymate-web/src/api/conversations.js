import client from './client'

/*
 * Response shapes below were captured from a live StudyMate backend
 * (FastAPI, /conversations) - they are NOT guesses.
 *
 * GET /conversations
 *   [ { id, user_id, document_id, title, created_at, is_pinned } ]
 *   `title` starts as the text of the first user message and can be renamed.
 *   Rows come back pinned first, then newest first within each group.
 *
 * PATCH /conversations/{id}
 *   request:  { title?, is_pinned? } - at least one; neither is a 400.
 *   response: { message, conversation: { id, title, is_pinned, document_id,
 *                                        created_at } }
 *   An empty or whitespace-only title is refused with a 400.
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
    /* Always a boolean. A backend from before the column existed sends
       nothing, which reads as unpinned rather than as undefined. */
    isPinned: Boolean(raw.is_pinned),
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

/**
 * PATCH /conversations/{conversation_id} - JSON { title?, is_pinned? }.
 *
 * PATCH, not PUT: the messages are not sent and are not replaced. The two
 * fields are sent independently because the pin control does not know the
 * title and the rename form does not know the pin - so only what changed
 * goes over the wire. Sending neither is a 400, which is why the callers
 * below each send exactly one.
 */
async function patchConversation(conversationId, payload) {
  const { data } = await client.patch(`/conversations/${conversationId}`, payload)
  const conversation = data?.conversation ?? {}

  return {
    id: String(conversation.id ?? conversationId),
    title: conversation.title ?? null,
    isPinned: Boolean(conversation.is_pinned),
    documentId: conversation.document_id ?? null,
    createdAt: conversation.created_at ?? null,
    message: data?.message ?? null,
  }
}

/** Give a conversation a title of the student's own. */
export async function renameConversation(conversationId, title) {
  return patchConversation(conversationId, { title })
}

/** Pin or unpin, which is what moves the row to the top of its group. */
export async function setConversationPinned(conversationId, isPinned) {
  return patchConversation(conversationId, { is_pinned: Boolean(isPinned) })
}

/** DELETE /conversations/{conversation_id} - also removes its messages. */
export async function deleteConversation(conversationId) {
  await client.delete(`/conversations/${conversationId}`)
}
