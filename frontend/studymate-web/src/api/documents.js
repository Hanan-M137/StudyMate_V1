import client from './client'

/**
 * DocumentResponse is fully specified in the OpenAPI spec:
 *   { id: uuid, title: string, filename: string, status: string }
 * No normalisation guesswork needed here.
 */

/** Status values we treat as "done processing". */
export const READY_STATUSES = ['ready', 'completed', 'processed', 'done']
export const FAILED_STATUSES = ['failed', 'error']

export function isReady(status) {
  return READY_STATUSES.includes(String(status || '').toLowerCase())
}

export function isFailed(status) {
  return FAILED_STATUSES.includes(String(status || '').toLowerCase())
}

export function isPending(status) {
  return !isReady(status) && !isFailed(status)
}

export async function listDocuments() {
  const { data } = await client.get('/documents')
  return Array.isArray(data) ? data : []
}

export async function getDocument(documentId) {
  const { data } = await client.get(`/documents/${documentId}`)
  return data
}

/** POST /documents - multipart/form-data, field name `file`, PDF only. */
export async function uploadDocument(file, onUploadProgress) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post('/documents', form, {
    onUploadProgress,
  })
  return data
}

/** PATCH /documents/{id} - JSON { title }. */
export async function renameDocument(documentId, title) {
  const { data } = await client.patch(`/documents/${documentId}`, { title })
  return data
}

export async function deleteDocument(documentId) {
  const { data } = await client.delete(`/documents/${documentId}`)
  return data
}
