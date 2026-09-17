/* ==========================================================================
   Which files the upload form offers, and which it refuses on the spot.

   SOURCE: ai/convert.py. CONVERTIBLE_EXTENSIONS plus ".pdf" over there is
   SUPPORTED_EXTENSIONS here, and the two lists have to be changed together -
   nothing checks that they agree.

   This is a courtesy, not a gate. The server decides, and it decides again
   on every request; all this does is keep the file picker from showing
   files that will be refused, and turn an obvious mistake into an immediate
   sentence instead of a round trip.
   ========================================================================== */

/* The extensions the server accepts, lowercased and with the dot. */
export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.xlsx',
  '.xls',
  '.odt',
  '.odp',
  '.ods',
  '.rtf',
]

/* The file input's accept attribute.

   Extensions only, with no MIME types beside them. A browser's idea of the
   MIME type of an Office file depends on what else is installed on the
   machine - the same .docx can arrive as application/octet-stream from one
   computer and as the full openxmlformats type from the next - so matching
   on the extension is the one rule that behaves the same everywhere. */
export const UPLOAD_ACCEPT = SUPPORTED_EXTENSIONS.join(',')

/**
 * True if this file's name ends in an extension the server accepts.
 */
export function isSupportedFile(file) {
  if (!file?.name) return false

  const name = file.name.toLowerCase()

  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension))
}
