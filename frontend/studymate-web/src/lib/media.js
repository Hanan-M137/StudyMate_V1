// The intro video. Either value being null is what makes the player render
// a placeholder instead; both are set now, so it renders the film.
//
// The files live in frontend/studymate-web/public/, which Vite serves as-is,
// so public/intro.mp4 is reachable at '/intro.mp4'. Changing the video means
// editing this file and nothing else.
export const INTRO_VIDEO_SRC = '/intro.mp4'
export const INTRO_VIDEO_POSTER = '/intro-poster.jpg'
