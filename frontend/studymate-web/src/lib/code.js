/* ==========================================================================
   Finding code inside text that nobody marked up as code

   Two places need this and neither gets any help from the sender. A chunk
   out of a PDF is plain text with no markup at all. An answer from Claude
   is fenced with ``` sometimes and not others - both came back during
   testing from the same question asked twice.

   So fences are honoured when they are there, and a run of code-looking
   lines is recognised when they are not.

   This matters for more than looks. Braces and brackets are bidi-mirrored
   characters, and ';' '=' and '.' are neutrals that take the direction of
   the paragraph around them. Inside an Arabic answer that makes
   `if (x) {` come out as `{ (x) if`, so the code has to be found before it
   can be isolated.
   ========================================================================== */

/* A line that ends in a brace or a semicolon, a line indented by two or
   more spaces, or a line opening with a keyword no sentence starts with. */
const CODE_LINE =
  /[{};]\s*$|^\s{2,}\S|^\s*(import|package|public|private|protected|static|final|class|interface|void|return|if|else|for|while|switch|case|try|catch|def|function|const|let|var)\b/

const FENCE_LINE = /^\s*```/

const ARABIC_CHARACTER = /[؀-ۿ]/g
const LATIN_CHARACTER = /[A-Za-z]/g

/* Two lines, not one: a single prose line ending in a semicolon is
   ordinary, and two in a row are not. */
const MINIMUM_CODE_LINES = 2

function isArabicDominant(text) {
  const arabic = (text.match(ARABIC_CHARACTER) || []).length
  const latin = (text.match(LATIN_CHARACTER) || []).length

  return arabic > latin
}

/**
 * Whether a whole string reads as a code listing.
 *
 * Used for a source chunk, which arrives as one unit and is either code
 * or it is not.
 */
export function looksLikeCode(text) {
  if (typeof text !== 'string' || text === '') return false

  if (isArabicDominant(text)) return false

  const lines = text.split('\n')

  /* A chunk stored before the extraction fix is one long line with its
     newlines already gone. It cannot be given them back here, but set
     monospaced and left to right it is still the more readable of the
     two wrong answers. */
  if (lines.length < MINIMUM_CODE_LINES) {
    return CODE_LINE.test(text) && /[{};]/.test(text)
  }

  return lines.filter((line) => CODE_LINE.test(line)).length >= MINIMUM_CODE_LINES
}

/**
 * Split an answer into alternating prose and code segments.
 *
 * Returns [{ type: 'prose' | 'code', text }] in the original order, with
 * empty segments dropped. Text with no code in it comes back as a single
 * prose segment, so the caller needs no special case for that.
 */
export function splitCodeSegments(text) {
  if (typeof text !== 'string' || text === '') return []

  const lines = text.split('\n')
  const segments = []

  let buffer = []
  let bufferType = 'prose'
  let fromFence = false
  let insideFence = false

  function flush() {
    const joined = trimBlankEdges(buffer)

    if (joined !== '') {
      segments.push({ type: bufferType, text: joined, fromFence })
    }

    buffer = []
  }

  for (const line of lines) {
    if (FENCE_LINE.test(line)) {
      /* The fence markers themselves are never shown. */
      flush()
      insideFence = !insideFence
      bufferType = insideFence ? 'code' : 'prose'
      fromFence = insideFence
      continue
    }

    if (insideFence) {
      buffer.push(line)
      continue
    }

    /* A blank line never changes which kind of segment we are in. A
       listing routinely has one between the imports and the class, and
       treating it as a boundary tore that listing into an "import" line
       the heuristic then read as a sentence. */
    if (line.trim() === '') {
      buffer.push(line)
      continue
    }

    const type = CODE_LINE.test(line) && !isArabicDominant(line) ? 'code' : 'prose'

    if (type !== bufferType) {
      flush()
      bufferType = type
      fromFence = false
    }

    buffer.push(line)
  }

  flush()

  return segments.map(({ type, text: segmentText, fromFence: fenced }) => ({
    /* An unfenced run of one line that merely looked code-like is far
       more likely to be a sentence - "import java.util.Scanner brings in
       the Scanner class" opens with a keyword and is prose. A fenced
       block is taken at its word however short it is. */
    type:
      type === 'code' && !fenced && countContentLines(segmentText) < MINIMUM_CODE_LINES
        ? 'prose'
        : type,
    text: segmentText,
  }))
}

function trimBlankEdges(lines) {
  let start = 0
  let end = lines.length

  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1

  return lines.slice(start, end).join('\n')
}

function countContentLines(text) {
  return text.split('\n').filter((line) => line.trim() !== '').length
}
