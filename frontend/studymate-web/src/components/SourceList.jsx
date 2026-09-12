import { useState } from 'react'
import { ChevronIcon } from './icons'
import { cx } from './ui'

/**
 * Sources returned with each chat answer. Verified shape from the backend:
 *   { chunk_id, content, page_number, similarity }
 * Older/unknown entries (plain strings, other key names) still render rather
 * than disappearing.
 *
 * Presented as collapsible citations so the thread stays readable.
 *
 * `similarity` is deliberately NOT shown. The retrieval model is
 * multilingual-e5-small, which places almost every score between 0.77 and
 * 0.88: measured on a real question, the page that answered it scored 0.85 and
 * a page with nothing to do with it scored 0.85 as well. The number looked
 * informative and was not, which is worse than leaving it out. The page number
 * and the passage itself are shown instead, and both are true.
 */
export default function SourceList({ sources }) {
  const [openIndex, setOpenIndex] = useState(null)

  if (!Array.isArray(sources) || sources.length === 0) return null

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <p className="type-eyebrow mb-2">
        {sources.length} {sources.length === 1 ? 'citation' : 'citations'}
      </p>
      <ul className="space-y-1.5">
        {sources.map((source, index) => {
          const parsed = parseSource(source)
          const open = openIndex === index
          return (
            <li key={parsed.key ?? index}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenIndex(open ? null : index)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-xs border px-2.5 py-1.5 text-left transition-colors duration-150',
                  open
                    ? 'border-accent-line bg-accent-soft'
                    : 'border-line bg-sunken/60 hover:border-line-strong',
                )}
              >
                <ChevronIcon
                  className={cx(
                    'h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150',
                    open && 'rotate-90',
                  )}
                />
                <span className="type-micro font-semibold text-ink-soft">
                  {parsed.page != null ? `Page ${parsed.page}` : `Source ${index + 1}`}
                </span>
              </button>

              {open ? (
                <div className="animate-enter mt-1.5 rounded-xs border border-line bg-surface px-3 py-2.5">
                  {parsed.text != null ? (
                    <p className="type-small whitespace-pre-line text-ink-soft">{parsed.text}</p>
                  ) : (
                    <pre className="type-micro overflow-x-auto whitespace-pre-wrap break-words text-muted">
                      {parsed.fallback}
                    </pre>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function parseSource(source) {
  if (source == null) return { text: null, page: null, fallback: '(empty source)' }

  if (typeof source === 'string' || typeof source === 'number') {
    return { text: String(source), page: null, key: null }
  }

  if (typeof source === 'object') {
    const text = source.content ?? source.text ?? source.chunk ?? source.snippet ?? null
    const page = source.page_number ?? source.page ?? source.pageNumber ?? null
    return {
      key: source.chunk_id ?? null,
      text: text != null ? String(text) : null,
      page,
      fallback: JSON.stringify(source, null, 2),
    }
  }

  return { text: String(source), page: null }
}