import { useState } from 'react'
import { useI18n } from '../context/I18nContext'
import { looksLikeCode } from '../lib/code'
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
  const { t } = useI18n()
  const [openIndex, setOpenIndex] = useState(null)

  if (!Array.isArray(sources) || sources.length === 0) return null

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <p className="type-eyebrow mb-2">
        {sources.length === 1
          ? t('sources.countOne', { count: sources.length })
          : t('sources.countOther', { count: sources.length })}
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
                  'flex w-full items-center gap-2 rounded-xs border px-2.5 py-1.5 text-start transition-colors duration-150',
                  open
                    ? 'border-accent-line bg-accent-soft'
                    : 'border-line bg-sunken/60 hover:border-line-strong',
                )}
              >
                {/* Closed it points along the text and has to turn round in
                    a right-to-left layout; open it points down, which is the
                    same direction in both. Mirroring and rotating at once
                    would compose into neither. */}
                <ChevronIcon
                  className={cx(
                    'h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150',
                    open ? 'rotate-90' : 'rtl:-scale-x-100',
                  )}
                />
                <span className="type-micro font-semibold text-ink-soft">
                  {parsed.page != null
                    ? t('sources.page', { page: parsed.page })
                    : t('sources.source', { number: index + 1 })}
                </span>
              </button>

              {open ? (
                <div className="animate-enter mt-1.5 rounded-xs border border-line bg-surface px-3 py-2.5">
                  {/* The snippet is a passage out of the student's own PDF, so
                      it decides its own direction rather than inheriting the
                      interface's. */}
                  {parsed.text != null && looksLikeCode(parsed.text) ? (
                    /* A code listing reads left to right whichever language
                       the interface is in, and its indentation carries
                       meaning, so it is not left to the snippet's dir="auto"
                       and not left to a rule that collapses spaces. */
                    <pre
                      dir="ltr"
                      className="type-micro overflow-x-auto whitespace-pre-wrap break-words font-mono text-ink-soft"
                    >
                      {parsed.text}
                    </pre>
                  ) : parsed.text != null ? (
                    <p
                      dir="auto"
                      className="type-small whitespace-pre-line text-ink-soft"
                    >
                      {parsed.text}
                    </p>
                  ) : (
                    <pre
                      dir="auto"
                      className="type-micro overflow-x-auto whitespace-pre-wrap break-words text-muted"
                    >
                      {parsed.fallbackKey ? t(parsed.fallbackKey) : parsed.fallback}
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
  /* A key, not a sentence: this runs outside the component, and the caller
     translates whatever it hands back. */
  if (source == null) return { text: null, page: null, fallbackKey: 'sources.empty' }

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