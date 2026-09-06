import client from './client'

/**
 * POST /chat -> ChatResponse { conversation_id, answer, sources[] }
 *
 * `sources` is typed as an array of unknown items in the spec, so the renderer
 * must handle strings and objects alike (see components/SourceList.jsx).
 *
 * conversation_id is omitted on the first message and echoed back by the
 * server; every later message in the same thread must send it.
 */
export async function sendChatMessage({ documentId, message, conversationId }) {
  const payload = { document_id: documentId, message }
  if (conversationId) payload.conversation_id = conversationId

  const { data } = await client.post('/chat', payload)
  return {
    conversationId: data?.conversation_id ?? conversationId ?? null,
    answer: data?.answer ?? '',
    sources: Array.isArray(data?.sources) ? data.sources : [],
  }
}
