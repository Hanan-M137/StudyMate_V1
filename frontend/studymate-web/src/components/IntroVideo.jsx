import { useId } from 'react'
import { useI18n } from '../context/I18nContext'
import { INTRO_VIDEO_POSTER, INTRO_VIDEO_SRC } from '../lib/media'
import { Card, CardBody, CardHeader } from './ui'

/* ==========================================================================
   The intro video, as a section.

   One card, the same shape as a settings section, so the component can be
   dropped beside the sign-in form and into the settings page without either
   caller styling it. It carries its own surface and its own border, which is
   what lets it sit on the accent panel of the auth pages and on the paper
   background of the settings page and look deliberate in both.

   It takes no props. Both of the things that vary - which file to play, and
   what the interface says - come from somewhere else: the path from
   lib/media.js, the words from the dictionaries. Swapping the video is an
   edit to lib/media.js and nothing here.
   ========================================================================== */

export default function IntroVideo() {
  const { t } = useI18n()

  /* A <section> is only a landmark once it has a name, and the name has to
     be an id reference rather than the heading's mere presence. useId keeps
     that unique if the component is ever rendered twice on one page. */
  const headingId = useId()

  return (
    <Card as="section" aria-labelledby={headingId} className="no-print">
      <CardHeader>
        <h2 id={headingId} className="type-title">
          {t('intro.heading')}
        </h2>
      </CardHeader>

      <CardBody className="space-y-3">
        {INTRO_VIDEO_SRC ? <Player /> : <ComingSoon />}

        {/* Said whichever language is running, and said in the placeholder
            state as well as the player state: a student who reads it before
            the video exists knows what to expect when it arrives. In the
            Arabic interface this is the sentence that says the video is in
            English - see the note on the key in ar.js. */}
        <p className="type-small text-muted">{t('intro.languageNote')}</p>
      </CardBody>
    </Card>
  )
}

/* ==========================================================================
   Before the file exists
   ========================================================================== */

/* No <video> with an empty source and no dashed rectangle standing in for
   one: an empty player reads as something that failed to load, and this
   state is not a failure. It is what the page looks like today and for a
   while yet, so it is a card with a sentence in it - finished-looking, just
   short. */
function ComingSoon() {
  const { t } = useI18n()

  return <p className="type-small text-muted">{t('intro.comingSoon')}</p>
}

/* ==========================================================================
   Once it does
   ========================================================================== */

function Player() {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <video
        /* preload="metadata" and not "auto": "auto" fetches the whole file
           on every page load, and the sign-in page is the one page every
           visitor sees and most of them will never press play on.

           No autoPlay: browsers block a video that starts with sound
           anyway, and one that starts without it is a page that moves while
           someone is trying to read it.

           playsInline: without it iOS Safari takes the video fullscreen the
           moment it starts, which throws the sign-in form off the screen. */
        controls
        preload="metadata"
        playsInline
        src={INTRO_VIDEO_SRC}
        /* Omitted rather than empty when there is no poster: poster="" makes
           some browsers request the page itself as an image. */
        poster={INTRO_VIDEO_POSTER || undefined}
        aria-label={t('intro.videoLabel')}
        className="aspect-video w-full max-w-xl rounded-sm bg-sunken"
      >
        {/* Reached only by a browser that cannot play the file at all. */}
        {t('intro.unsupported')}
      </video>

      <p className="type-small text-muted">{t('intro.caption')}</p>
    </div>
  )
}
