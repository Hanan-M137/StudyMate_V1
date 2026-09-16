import { useEffect, useState } from 'react'
import { useI18n } from '../context/I18nContext'
import { ArrowUpIcon } from './icons'

/* ==========================================================================
   BackToTop - jump to the top of a long page.

   WHICH ELEMENT SCROLLS: the window.

   This was checked before the component was written, because listening to
   the wrong one is a button that simply never appears. In AppShell the
   <main> element carries no overflow rule, and neither does the conversation
   page inside it; the shell is `min-h-full` and the desktop sidebar is
   `sticky h-screen`, which is a technique for staying put while the document
   scrolls behind it, not for scrolling separately. So the document scrolls,
   and window scroll/scrollY are the right things to read.

   If an inner scroll container is ever introduced, this component stops
   working and needs the container passed to it - it will not fail loudly.
   ========================================================================== */

/* One viewport height. Below that the top is still nearby - often still on
   screen - and a button offering to take you there is answering a question
   nobody asked. */
function threshold() {
  return window.innerHeight
}

export default function BackToTop() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function update() {
      setVisible(window.scrollY > threshold())
    }

    /* Run once on mount as well as on scroll: arriving at a page already
       scrolled - a browser restoring a position, or an in-page anchor -
       fires no scroll event, and the button would stay hidden on exactly
       the page that most needs it. */
    update()

    /* passive: this listener never calls preventDefault, and saying so lets
       the browser scroll without waiting to find out. */
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      /* The same check the rest of the app makes before animating: a student
         who has asked their OS for less motion has asked this button too. */
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }

  if (!visible) return null

  return (
    /* Bottom LEFT. The conversation page keeps its Send button at the bottom
       right, and a floating button on top of it would cover the control the
       student is actually reaching for. */
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('common.backToTop')}
      className="no-print animate-enter fixed bottom-5 left-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft shadow-raised transition-colors duration-150 hover:bg-sunken hover:text-ink"
    >
      <ArrowUpIcon className="h-[18px] w-[18px]" />
    </button>
  )
}
