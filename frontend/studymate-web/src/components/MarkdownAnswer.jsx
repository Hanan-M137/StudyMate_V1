/* ==========================================================================
   An answer from Claude, rendered as Markdown.

   The answers have always contained Markdown - headings, bold, tables,
   blockquotes - and until now the student read the symbols themselves:
   literal '##' at the start of a line, '**' wrapped round a phrase, a table
   arriving as a row of pipes. The text was never the problem; nothing here
   changes what the model says, only how it is drawn.

   GitHub-flavoured Markdown, not the plain CommonMark default, because
   tables are the whole reason this became visible: they are a GFM extension
   and without remark-gfm the pipes stay pipes.

   WHAT THIS DELIBERATELY DOES NOT DO: styling by way of a typography
   plugin. Every element below is given its own classes out of the same
   type-* and colour tokens the rest of the app uses, so an answer sits in
   the thread looking like the app rather than like a document someone
   pasted in.
   ========================================================================== */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/* ==========================================================================
   Line breaks

   Markdown collapses a single newline into a space, and the answers rely on
   single newlines: the system prompt asks for several numbered parts to be
   given "each part its own line", and those lines arrive separated by one
   '\n', not by a blank line. Parsed as Markdown and drawn normally they
   would all run together into one paragraph - a regression the student
   would see on every multi-part answer.

   `whitespace-pre-line` on the text-carrying elements restores them. The
   newline survives into the rendered text node, and the CSS honours it, so
   the old line-for-line shape comes back without a second remark plugin.
   ========================================================================== */

const BREAKS = 'whitespace-pre-line'

/* ==========================================================================
   Code

   The reason this file takes an interest in code at all. Braces and
   brackets are bidi-mirrored characters and ';' '=' and '.' are neutrals
   that take the direction of the paragraph around them, so code sitting
   inside an Arabic answer reorders into nonsense - `if (x) {` comes out as
   `{ (x) if`. The fix from the code-display batch was to give the code its
   own direction, and it is preserved here rather than reimplemented: these
   two overrides are what carries it through the switch to Markdown.

   dir="ltr" is doing two jobs at once. It sets the direction, and per the
   HTML rendering rules any element carrying a dir attribute also gets
   `unicode-bidi: isolate` - so an inline `HashMap` inside an Arabic
   sentence is worked out on its own and then placed back as one unit,
   instead of dragging the surrounding punctuation to the wrong end. Same
   bargain as the isolate characters in lib/language.js.

   Inline code is given a pill background; the same element inside a block
   must not be, or every fenced listing would be drawn as a run of pills.
   The block resets it for its own descendants rather than trying to tell
   the two apart from the class name, which is not reliable - a fence with
   no language after the backticks produces no language-* class at all.
   ========================================================================== */

const CODE_BLOCK =
  'type-small my-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-ink ' +
  '[&_code]:bg-transparent [&_code]:px-0 [&_code]:py-0 [&_code]:text-[1em]'

const CODE_INLINE = 'rounded-xs bg-sunken px-1 py-0.5 font-mono text-[0.9em] text-ink'

/* ==========================================================================
   The element map

   Logical properties throughout - ps-*, border-s-*, text-start - never left
   and right. The direction of an answer is decided by its own text, not by
   the interface language, so a rule written as `pl-5` would indent an
   Arabic list from the wrong side on an otherwise English page.
   ========================================================================== */

const COMPONENTS = {
  /* '#' through '######' all land inside a chat card, so none of them can
     be display-sized. The first two take the title face and the rest are
     body text at a heavier weight, which is as much hierarchy as a bubble
     this narrow can carry. `first:mt-0` keeps an answer that opens with a
     heading from starting with a gap. */
  h1: ({ children }) => (
    <h1 className="type-title mt-4 mb-2 text-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="type-title mt-4 mb-2 text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="type-body mt-3.5 mb-1.5 font-semibold text-ink first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="type-body mt-3.5 mb-1.5 font-semibold text-ink first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="type-body mt-3.5 mb-1.5 font-semibold text-ink first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="type-body mt-3.5 mb-1.5 font-semibold text-ink first:mt-0">{children}</h6>
  ),

  p: ({ children }) => (
    <p className={`type-body mb-2 text-ink last:mb-0 ${BREAKS}`}>{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="type-body mb-2 list-disc space-y-1 ps-5 text-ink last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="type-body mb-2 list-decimal space-y-1 ps-5 text-ink last:mb-0">{children}</ol>
  ),
  /* No BREAKS on the item itself, deliberately, and it was there until a
     real answer showed why it cannot be. A list whose items are separated
     by blank lines is a "loose" list: every item's content is wrapped in a
     paragraph, and the blank line survives as a whitespace-only text node
     sitting in the item beside that paragraph. Honouring newlines on the
     item drew that node as an empty line, so all five items in the first
     Arabic answer came out 102px tall with a gap above each one - spacing
     Markdown had already expressed by wrapping them in paragraphs.

     The paragraph inside carries the newline handling instead, which is
     where the text actually is. The cost is that a single newline inside
     one item of a TIGHT list collapses into a space, and that is the right
     side to err on: a tight item is one line by construction. */
  li: ({ children }) => <li>{children}</li>,

  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-s-2 border-accent-line ps-3 text-ink-soft last:mb-0">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3 border-line" />,

  /* An answer may cite a URL out of the document. It opens in a new tab so
     the thread it belongs to is not lost, and noreferrer goes with _blank
     for the usual reason. */
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2 transition-colors hover:text-accent-hover"
    >
      {children}
    </a>
  ),

  /* A comparison table is wider than 65ch more often than not, and the
     bubble must not be the thing that stretches. The scroll lives on a
     wrapper so the table keeps its own borders at both edges. */
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="type-small w-full border-collapse text-ink">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-sunken px-2.5 py-1.5 text-start font-semibold">
      {children}
    </th>
  ),
  /* text-start, not the browser default. A td defaults to the direction's
     start already, but a th defaults to centre, and a header centred over a
     column of start-aligned cells reads as a mistake in either direction. */
  td: ({ children }) => (
    <td className="border border-line px-2.5 py-1.5 align-top text-start">{children}</td>
  ),

  pre: ({ children }) => (
    <pre dir="ltr" className={CODE_BLOCK}>
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code dir="ltr" className={CODE_INLINE}>
      {children}
    </code>
  ),
}

/* ==========================================================================
   The component

   No direction of its own. The caller wraps the whole answer in one
   direction and everything here inherits it - including the table, which is
   the element the spec singles out: inside an rtl container its columns run
   right to left and its cells align to the right without anything further
   being said here.
   ========================================================================== */

export default function MarkdownAnswer({ text }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  )
}
