import client from './client'

/*
 * The contact form.
 *
 * One call and one field. The name and the email are NOT sent: the
 * server reads them off the account the access token belongs to, so
 * a message can never claim to come from somebody it did not come
 * from. The two read-only boxes on the page are there to show the
 * student what the server already knows, not to supply it.
 *
 * POST /contact
 *   request:  { message }
 *   response: 201 { id }
 *
 * `id` is the stored row and is the whole response on purpose. There
 * is deliberately no delivery status in it: the message is received
 * the moment the row is committed, and whether the notification
 * email went out afterwards is the owner's problem to see, not the
 * student's.
 *
 * The 400s (empty, too short, too long) and the 429 (too many in an
 * hour) are recognised and translated in lib/serverErrors.js.
 */

/** POST /contact - JSON { message } -> { id }. */
export async function sendContactMessage({ message }) {
  const { data } = await client.post('/contact', { message })

  return {
    id: data?.id != null ? String(data.id) : null,
  }
}
