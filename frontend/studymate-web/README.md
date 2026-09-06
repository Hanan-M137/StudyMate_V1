# StudyMate Web

React frontend for the StudyMate API (FastAPI). Built with Vite, React Router,
axios and Tailwind CSS. No TypeScript, no component library.

## Running it

```bash
npm install
cp .env.example .env      # then edit VITE_API_URL if the backend is elsewhere
npm run dev               # http://localhost:5173
npm run build             # production build into dist/
```

The backend is expected at `VITE_API_URL` (default `http://localhost:8000`),
started with:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 --log-level debug
```

If the browser reports a CORS error, add `http://localhost:5173` to the
backend's `CORSMiddleware` allowed origins.

## Layout

```
src/
  api/
    client.js         axios instance, bearer header, 401 -> refresh -> retry
    tokens.js         access/refresh token storage
    auth.js           /auth/login (urlencoded), /auth/register, /auth/refresh
    documents.js      /documents CRUD + upload + status helpers
    chat.js           /chat
    conversations.js  /conversations  (response shape assumed - see TODO)
    quizzes.js        /quizzes        (response shape assumed - see TODO)
  context/AuthContext.jsx
  components/         ProtectedRoute, Layout, SourceList, ui primitives
  pages/              Login, Register, Documents, DocumentChat,
                      Conversations, ConversationDetail, Quizzes, QuizTake
  lib/errors.js       turns 422 detail[].msg lists into readable messages
```

## Notes on the API

* `POST /auth/login` is `application/x-www-form-urlencoded` and the email goes
  in the `username` field.
* `POST /auth/refresh` rotates the refresh token, so both tokens are replaced
  on every refresh. Concurrent 401s are queued so only one refresh is issued.
* Document uploads are processed by a background task, so the `status` returned
  by `POST /documents` is not final. The documents list polls
  `GET /documents/{id}` every 4s while a document is not ready.
* The first `/chat` message omits `conversation_id`; the id returned by the
  server is reused for every following message in that thread.
* `GET /quizzes/{id}` deliberately omits `correct_answer` and `explanation`.
  The UI never expects them before submission.

## Design system

One visual identity, defined once and used everywhere:

* **Tokens** live in `src/index.css` under `@theme` - a warm paper/ink neutral
  ramp (`paper`, `surface`, `sunken`, `ink`, `ink-soft`, `muted`, `faint`,
  `line`, `line-strong`), a single evergreen accent (`accent`, `accent-hover`,
  `accent-soft`, `accent-line`, `on-accent`) and two status ramps (`pending`,
  `danger`). Tailwind turns each into utilities (`bg-surface`, `text-ink`,
  `border-line`). Pages never hardcode a palette colour such as `bg-white` or
  `text-slate-500`.
* **Type**: Fraunces (display) for headings and Inter for UI/body, loaded in
  `index.html` with system fallbacks. The scale is exposed as `.type-display`,
  `.type-title`, `.type-eyebrow`, `.type-body`, `.type-small`, `.type-micro`.
  `.measure` caps reading columns at 65ch and is applied to chat messages and
  quiz questions.
* **Radii / elevation**: `--radius-xs..xl` and exactly three shadows
  (`shadow-card` for resting surfaces, `shadow-raised` for the score card,
  `shadow-pop` for modals).
* **Primitives** in `src/components/ui/`: `Button`, `Card` (+ header/body/
  footer), `Badge`, `Spinner`, `Field`/`Input`/`Select`/`Textarea`/`Label`,
  `Modal`/`ConfirmDialog`, `EmptyState`, `ErrorState`, `InlineError`,
  `LoadingState`, `Skeleton`. Import them from `../components/ui`.
* **Motion** is limited to a 160ms enter and the typing dots, and everything is
  disabled under `prefers-reduced-motion`. Smooth scrolling is skipped in JS
  when that media query matches.
* **Accessibility**: one `:focus-visible` ring for the whole app, a skip link,
  labelled inputs via `Field`, a real focus-trapped dialog, and a sidebar that
  becomes a drawer below `lg`. Verified down to 375px.

## Quiz question types

`question_type` is optional in the spec and the backend ignores it - it always
generates a mix - so the request does not send it and the UI does not offer a
control for it. `num_questions` is respected and is still configurable.

The quiz screen renders whatever comes back: any question with `options`
becomes a choice list, anything without becomes a free-text answer, and an
unrecognised `question_type` is labelled from its own name rather than
crashing or rendering blank.

## Response shapes (verified against a running backend)

The OpenAPI document declares an empty schema (`{}`) for several endpoints.
Those were captured from a live backend and are now hard-coded, with the real
payloads documented at the top of `src/api/conversations.js` and
`src/api/quizzes.js`:

```
GET  /conversations       -> [ { id, user_id, document_id, title, created_at } ]
GET  /conversations/{id}  -> { conversation: {...}, messages: [...] }
POST /quizzes             -> { message, quiz_id, questions_count }
GET  /quizzes/{id}        -> { quiz: {...}, questions: [...] }
POST /quizzes/{id}/attempts
                          -> { message, attempt_id, score, total_questions,
                               percentage, correct_answers, wrong_answers,
                               results: [ { question_id, student_answer, correct } ] }
```

Two traps worth remembering:

* `messages` and `questions` are **siblings** of `conversation` / `quiz`, not
  nested inside them.
* `question_type` varies per question even when the quiz was requested as
  `multiple_choice`. `short_answer` questions come back with `options: null`
  and need a free-text input.

Document status goes `pending` -> `ready`. `sources` entries are
`{ chunk_id, content, page_number, similarity }`.

## When the assistant says it cannot find the information

`POST /chat` answers `"I could not find this information in your document."`
with `sources: []` whenever vector search returns nothing above the backend's
similarity threshold. That is a backend retrieval setting, not a frontend
problem - the request the UI sends is identical to the one Swagger sends. The
chat view detects this case and explains it instead of leaving the bare
sentence on screen.
