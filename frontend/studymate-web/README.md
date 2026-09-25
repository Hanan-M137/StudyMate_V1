# StudyMate Web

React frontend for the StudyMate API (FastAPI). Built with Vite, React Router,
axios, Tailwind CSS, and react-markdown with remark-gfm. No TypeScript, no
component library.

Requires Node.js 20.19+ or 22.12+ (the minimum Vite 8 declares).

## Running it

```bash
npm install
cp .env.example .env      # then edit VITE_API_URL if the backend is elsewhere
npm run dev               # http://localhost:5173
npm run build             # production build into dist/
npm run lint              # oxlint
```

The backend is expected at `VITE_API_URL` (default `http://localhost:8000`),
started from the repository root with:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 --log-level debug
```

The backend's `CORSMiddleware` allows `http://localhost:5173` and nothing
else. If Vite starts on another port (because 5173 is taken), or the app is
served from anywhere else, the browser reports a CORS error until that origin
is added in `backend/main.py`.

After editing either translation file, check that both have the same keys:

```bash
node scripts/check-i18n-keys.mjs
```

## Layout

```
src/
  api/
    client.js         axios instance, bearer header, 401 -> refresh -> retry
    tokens.js         access/refresh token storage (localStorage)
    auth.js           login (urlencoded), register, refresh, logout, /auth/me
                      (get, update, delete), change-password, verify-email,
                      resend-verification
    documents.js      /documents CRUD + upload + status helpers
    chat.js           /chat
    conversations.js  /conversations: list, get, rename, pin, delete
    quizzes.js        /quizzes: create, list, get, rename, pin, delete,
                      attempts (submit, list, get, delete)
    contact.js        /contact
  context/            AuthContext, I18nContext
  i18n/               en.js, ar.js
  components/         AppShell, ProtectedRoute, SourceList, MarkdownAnswer,
                      VoiceInput, UploadDropzone, PinButton, VerifyEmailPanel,
                      IntroVideo, BackToTop, PageHeader, icons, ui primitives
  pages/              Login, Register, AuthLayout, Documents, DocumentChat,
                      Conversations, ConversationDetail, Quizzes, QuizTake,
                      Settings, Contact, NotFound
  lib/
    errors.js         turns 422 detail[].msg lists into readable messages
    serverErrors.js   translates the backend's own `detail` sentences
    language.js       UI language, page direction, text-direction helpers
    ...               theme, pinned ordering, password rules, uploads, media
```

## Notes on the API

* `POST /auth/login` is `application/x-www-form-urlencoded` and the email goes
  in the `username` field.
* `POST /auth/refresh` rotates the refresh token, so both tokens are replaced
  on every refresh. Concurrent 401s are queued so only one refresh is issued.
* `POST /auth/logout` revokes every token the account holds, on every device.
* `DELETE /auth/me` deletes the account and everything in it, permanently. It
  requires `current_password` in the body.
* Document uploads are processed by a background task, so the `status` returned
  by `POST /documents` is not final. The documents list polls
  `GET /documents/{id}` every 4s while a document is not ready.
* The first `/chat` message omits `conversation_id`; the id returned by the
  server is reused for every following message in that thread.
* `GET /quizzes/{id}` deliberately omits `correct_answer` and `explanation`.
  The UI never expects them before submission. It does still send
  `source_page`; the UI shows it only after the quiz is submitted.

## Chat answers

Answers are rendered as GitHub-flavoured Markdown by
`components/MarkdownAnswer.jsx` (`react-markdown` + `remark-gfm`), so tables,
bold and `###` subheadings display as formatting rather than symbols. Single
newlines are kept (`whitespace-pre-line`), because the answers rely on them.

Code blocks and inline code carry `dir="ltr"`, so code inside an Arabic answer
is not reordered by the surrounding right-to-left text.

## Language and direction

The interface is available in English and Arabic (`src/i18n/`). Choosing
Arabic sets `dir="rtl"` on the document and switches the fonts to IBM Plex
Sans Arabic, because Fraunces and Inter carry no Arabic glyphs.

Content is directed by its own text, not by the interface language. Chat
messages and source passages take the direction of the script they mostly
contain, and short values that mix scripts or numbers (titles, counts, dates)
are isolated so they are not reordered by the text around them. The helpers
are in `lib/language.js`.

## Design system

One visual identity, defined once and used everywhere:

* **Tokens** live in `src/index.css` under `@theme`. There is a warm
  paper/ink neutral ramp (`paper`, `surface`, `sunken`, `ink`, `ink-soft`,
  `muted`, `faint`, `line`, `line-strong`), a single evergreen accent
  (`accent`, `accent-hover`, `accent-soft`, `accent-line`, `on-accent`) and
  two status ramps (`pending`, `danger`). Tailwind turns each into utilities
  (`bg-surface`, `text-ink`, `border-line`). Pages never hardcode a palette
  colour such as `bg-white` or `text-slate-500`. A dark theme
  (`:root[data-theme="dark"]`) redefines the same token names.
* **Type**: Fraunces (display) for headings and Inter for UI/body, with IBM
  Plex Sans Arabic in Arabic, all loaded in `index.html` with system
  fallbacks. The scale is exposed as `.type-display`, `.type-title`,
  `.type-eyebrow`, `.type-body`, `.type-small`, `.type-micro`. `.measure`
  caps reading columns at 65ch and is applied to chat messages and quiz
  questions.
* **Radii / elevation**: `--radius-xs..xl` and exactly three shadows
  (`shadow-card` for resting surfaces, `shadow-raised` for the score card,
  `shadow-pop` for modals).
* **Primitives** in `src/components/ui/`: `Button`, `Card` (+ header/body/
  footer), `Badge`, `Spinner`, `Field`/`Input`/`Select`/`Textarea`/`Label`,
  `PasswordInput`, `Modal`/`ConfirmDialog`, `EmptyState`, `ErrorState`,
  `InlineError`, `LoadingState`, `Skeleton`. Import them from
  `../components/ui`.
* **Motion** is limited to a 160ms enter and the typing dots, and everything is
  disabled under `prefers-reduced-motion`. Smooth scrolling is skipped in JS
  when that media query matches.
* **Accessibility**: one `:focus-visible` ring for the whole app, a skip link,
  labelled inputs via `Field`, a real focus-trapped dialog, and a sidebar that
  becomes a drawer below `lg`. Verified down to 375px.

## Quiz question types

The quiz form sends `question_types`, a list of any of `multiple_choice`,
`true_false` and `short_answer`. The backend generates only those types and
drops anything else the model produces. Leaving the list out means all three.
`num_questions` (1 to 50) must be at least the number of types chosen. The form
can also send `description` (what to focus on, not stored) and `start_page` /
`end_page` (both or neither).

The quiz screen renders whatever comes back. Any question with `options`
becomes a choice list, anything without becomes a free-text answer, and an
unrecognised `question_type` is labelled from its own name rather than
crashing or rendering blank.

## Response shapes

The OpenAPI document declares an empty schema (`{}`) for several endpoints.
Those were captured from a live backend and are hard-coded, with the real
payloads documented at the top of `src/api/conversations.js` and
`src/api/quizzes.js`:

```
GET  /conversations       -> [ { id, user_id, document_id, title, is_pinned, created_at } ]
GET  /conversations/{id}  -> { conversation: {...}, messages: [...] }
POST /quizzes             -> { message, quiz_id, questions_count, warnings }
GET  /quizzes/{id}        -> { quiz: {...},
                               questions: [ { id, question_text, question_type,
                                              options, source_page } ] }
POST /quizzes/{id}/attempts
                          -> { message, attempt_id, score, total_questions,
                               percentage, correct_answers, partial_answers,
                               wrong_answers, results: [...] }
```

Two traps worth remembering:

* `messages` and `questions` are **siblings** of `conversation` / `quiz`, not
  nested inside them.
* `question_type` varies per question. `short_answer` questions come back
  with `options: null` and need a free-text input.

Document status goes `pending` -> `processing` -> `ready`, or `failed`.
`sources` entries are `{ chunk_id, content, page_number, similarity }`.
`similarity` is not shown: the retrieval model scores nearly everything in a
narrow band, so the number looks meaningful and is not.

## When the question is not in the document

When the backend finds nothing relevant in the document, it does not refuse.
It answers from general knowledge, says in the answer itself that the answer
did not come from the document, and returns `sources: []`. The chat view
shows that answer like any other, with no source list.
