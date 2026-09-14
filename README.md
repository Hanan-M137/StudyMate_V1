# StudyMate

StudyMate is an AI-powered study assistant designed to help university students study from their own documents, in Arabic and in English.

The system allows students to:

- Create an account and log in.
- Upload PDF study materials.
- Process uploaded documents using text extraction and embeddings.
- Ask questions about uploaded documents and continue earlier conversations.
- Receive AI-generated answers based on the document content using RAG (Retrieval-Augmented Generation).
- View source passages and page references used to generate answers.
- Get an answer from general knowledge, clearly marked as such, when the question is not covered by the document.
- Generate AI-powered quizzes from uploaded documents, choosing which question types to include and what the quiz should focus on.
- Submit quiz answers and receive a score, with written answers judged on meaning rather than exact wording.
- See the correct answers and explanations after submitting.
- Review every past attempt at a quiz.
- Delete documents, conversations and quizzes.
- Sign out, with every token issued to the account revoked on the server.

---

## Project Structure

```text
StudyMate/

├── ai/
│   ├── anthropic_client.py
│   ├── embedding_service.py
│   ├── input_gate.py
│   ├── rag_service.py
│   ├── reranker_service.py
│   └── service.py
│
├── backend/
│   ├── auth.py
│   ├── database.py
│   ├── main.py
│   └── models.py
│
├── frontend/
│   └── studymate-web/
│
├── tests/
│   ├── test_auth.py
│   ├── test_rag_service.py
│   └── test_service.py
│
├── uploads/
│
├── .env.example
├── .gitignore
├── pytest.ini
├── README.md
└── requirements.txt
```

---

## Requirements

Before running the project, make sure you have:

- Python 3.11 or later
- Node.js 18 or later (for the frontend)
- PostgreSQL
- PostgreSQL pgvector extension
- PostgreSQL pg_trgm extension
- Tesseract OCR, including the Arabic language data (`ara`) for Arabic documents
- An Anthropic API key

---

## Installation

### 1. Clone the repository

    git clone <repository-url>
    cd StudyMate

### 2. Create a virtual environment

On Windows:

    python -m venv venv

Activate it:

    .\venv\Scripts\Activate.ps1

### 3. Install dependencies

    pip install -r requirements.txt

### 4. Install the frontend dependencies

    cd frontend\studymate-web
    npm install

---

## Environment Variables

Create a `.env` file in the project root.

The required variables are:

    DATABASE_URL=
    SECRET_KEY=
    ANTHROPIC_API_KEY=
    CLAUDE_MODEL=

The optional variables are:

    CLAUDE_FAST_MODEL=
    TESSERACT_CMD=

`CLAUDE_FAST_MODEL` selects a cheaper model for the small calls - grading a
written quiz answer, and rewriting a follow-up question so it can be searched
on its own. Left unset, those calls use the same model as `CLAUDE_MODEL`.

`TESSERACT_CMD` is the full path to the Tesseract executable. Windows installs
it outside PATH, so it has to be named:

    TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

On Linux and macOS it is normally on PATH already and the variable can be left
out entirely.

Use `.env.example` as a template.

Do not commit the `.env` file to GitHub because it may contain secrets such as API keys and database credentials.

---

## Database Setup

StudyMate uses PostgreSQL with the pgvector extension, and additionally uses PostgreSQL's built-in pg_trgm extension for hybrid (lexical + semantic) search.

Make sure PostgreSQL is installed and running.

Create a PostgreSQL database and configure the `DATABASE_URL` variable in `.env`.

Example:

    DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/studymate

The application enables the pgvector extension when the database is initialized.

The pg_trgm extension must currently be enabled manually. Connect to the database and run:

    CREATE EXTENSION IF NOT EXISTS pg_trgm;

### A note on schema changes

The project has no migration tool. Tables are created from the SQLAlchemy
models on startup, which creates missing tables but never alters an existing
one. A column added to a model therefore reaches a fresh database
automatically and an existing database not at all - it has to be applied by
hand. The most recent example:

    ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

---

## Running the Backend

From the project root, activate the virtual environment:

    .\venv\Scripts\Activate.ps1

Then start the FastAPI server:

    uvicorn backend.main:app --reload

The API will be available at:

    http://127.0.0.1:8000

FastAPI interactive documentation is available at:

    http://127.0.0.1:8000/docs

---

## Running the Frontend

In a second terminal:

    cd frontend\studymate-web
    npm run dev

The frontend expects the backend to be running at the address configured in
its own environment file.

---

## Running Tests

The project includes an automated test suite (pytest) covering authentication, PDF/text-processing logic, and the RAG retrieval pipeline.

From the project root, with the virtual environment activated:

    python -m pytest tests -v

Use `python -m pytest` rather than a bare `pytest` command, to make sure the virtual environment's own installed packages are used rather than any global installation.

---

## Document Processing

A PDF is processed once, when it is uploaded, and never read again: every
question and every quiz afterwards works from the stored text. The processing
runs in the background, so the upload request returns immediately and the
document's status moves from `processing` to `ready`.

Every page is read **twice** - once directly from the PDF's own text layer in
visual reading order, and once by rendering the page as an image and running
OCR on it. The two results are then compared and the better one is kept. A
candidate is never judged on its own, because neither method is reliably
better: OCR rescues a scanned page, and ruins a vocalized Arabic one.

Two problems specific to Arabic textbooks are handled before that comparison:

**Broken font encoding.** Some Arabic PDFs embed a font whose character map is
wrong: the shape drawn on the page is correct, but the code point the extractor
reads belongs to another script entirely. In the textbook this project was
tested against, three separate characters - Latin, Cyrillic and Armenian - all
stood for alef, one per font used in the book, affecting 1777 characters across
118 of its 120 pages. The same extractor also wrote hamza-alef as two
characters. Both are repaired before anything else looks at the text.

**OCR losing the Arabic.** When OCR fails on an Arabic page it does not return
*less* text, it returns more: words broken into single letters, decorative
borders read as long strings of punctuation. Every length-based or
character-based quality rule therefore reads a failed OCR result as an
improvement. Average Arabic word length separates the two reliably, but only as
a comparison between the two candidates for the same page - measured across the
affected pages, the two ranges overlap, so no fixed threshold can split them.

---

## AI and RAG

StudyMate uses a Retrieval-Augmented Generation (RAG) pipeline.

The main steps are:

1. A PDF document is uploaded and processed as described above.
2. The document is divided into chunks, each carrying its page number.
3. Embeddings are generated using sentence-transformers and stored in PostgreSQL using pgvector.
4. When a student sends a chat message, an input gate first checks whether it is trivial small talk (a greeting or a closing, in Arabic or English). If so, an instant canned reply is returned immediately without calling the AI pipeline.
5. A follow-up question is rewritten so that it stands on its own, since "and why?" cannot be searched for as it is.
6. Relevant chunks are retrieved by hybrid search: dense (embedding-based) similarity combined with PostgreSQL trigram lexical similarity (pg_trgm) through Reciprocal Rank Fusion (RRF). The two answer different questions - one knows that "أنثى الأسد" and "اللبؤة" mean the same thing, the other catches a name or a number literally - and a chunk that appears in both lists outranks one that led a single list.
7. The top candidates are re-scored by a cross-encoder reranking model, which reads the question and the passage together rather than embedding each on its own.
8. The **highest** rerank score decides the path. Above the threshold, the retrieved chunks are sent to Claude, which answers from them and cites pages. Below it, nothing is sent: the question is answered from general knowledge and the student is told the answer did not come from their document.
9. The sources displayed are the pages Claude actually cited, not the pages that scored well.

Two design decisions in that pipeline are worth stating plainly, because both
were arrived at by measurement after the obvious version failed:

**The threshold is applied to the best chunk, not to each chunk.** Filtering
chunk by chunk looks reasonable and is wrong: a page reading literally
"اللبؤة: أنثى الأسد" scored -1.06 with this reranker while a page that merely
mentioned hunting scored +0.59, so the definition was discarded and the
allusion survived. The reranker orders Arabic passages well but its absolute
scale sits low, which makes it a good sorter and a bad judge. Sorting is what
it is now asked to do; the reading is left to Claude.

**The threshold value sits inside a measured gap, not at zero.** Across real
questions, passages whose answer was in the document scored +0.59 to +5.24 in
Arabic and +1.39 to +7.42 in English, while questions the document did not
cover scored -2.74 to -0.08 and -6.04 to -3.51. The value in the code sits
inside both gaps. It is not a percentage and means nothing on its own - swap
the reranker and it has to be measured again.

### Models

Four models are used, three of them local and free:

| Purpose | Model | Where |
|---|---|---|
| Retrieval embeddings | `intfloat/multilingual-e5-small` (384 dimensions) | `ai/embedding_service.py` |
| Input gate | `all-MiniLM-L6-v2` | `ai/embedding_service.py`, used by `ai/input_gate.py` |
| Reranking | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | `ai/reranker_service.py` |
| Answering, quiz generation, grading written answers | Anthropic Claude | `ai/anthropic_client.py` |

The retrieval model requires the prefixes `query: ` and `passage: ` on the two
kinds of text. They are not decoration: results are worse without them and
worse still with the wrong one, silently.

The input gate deliberately keeps its own model rather than sharing the
retrieval one. It works by comparing a message against reference phrases and
testing the result against a fixed threshold, and the retrieval model
compresses nearly every score into a narrow band - measured, the gap between a
greeting and a real question fell from 0.1285 to 0.0022, which is no gap at
all. An absolute threshold needs a stable scale more than it needs multilingual
understanding.

---

## Quizzes

A quiz is generated from the document by Claude, which is given content sampled
evenly across the whole document rather than only its opening pages.

When creating a quiz the student chooses how many questions to generate, which
of the three question types to include (multiple choice, true/false, short
answer), and optionally what the quiz should concentrate on. The chosen types
are enforced twice: the prompt is told, and anything outside them is dropped
before the questions are saved - a model told to produce one type will still
slip in another.

Multiple choice and true/false answers are compared as strings, which is what
they are. Written answers are not: measured over the stored questions, the
average correct answer is 16.9 words long and only 2 of 24 are short enough for
any string comparison to work. They are judged by Claude on meaning instead,
returning one of three verdicts - correct, partially correct, or incorrect -
with a short explanation written to the student saying what was right and what
was missing. A partially correct answer earns the mark and says so.

After submitting, the correct answer is revealed: the right option is marked in
the list, a written question shows the model answer beside what the student
wrote, and the stored explanation is shown. None of this is sent to the browser
before the quiz is submitted.

Past attempts are listed on the quiz page and can be opened question by
question. The score is stored; the per-question verdicts are not, so choice
questions are re-compared on the spot - free, and identical to the original
marking - while a written answer is shown beside the model answer without a
mark, since re-judging it would be a paid call that could disagree with the
mark the student already saw.

---

## Main Technologies

### Backend

- FastAPI
- SQLAlchemy
- PostgreSQL
- pgvector
- pg_trgm
- Pydantic
- JWT authentication (PyJWT) and password hashing (passlib + bcrypt)

### AI

- Anthropic Claude API
- Sentence Transformers (embeddings and cross-encoder reranking)
- Retrieval-Augmented Generation (RAG) with hybrid search (dense + pg_trgm lexical search combined via Reciprocal Rank Fusion)
- PDF text extraction using PyMuPDF (fitz), with Tesseract OCR (pytesseract) compared against it page by page
- pyspellchecker, used to help judge extraction quality on English text

### Frontend

- React with Vite
- React Router
- Tailwind CSS
- axios

The `frontend/studymate-web/` directory contains the client-side application.

---

## API Documentation

After starting the backend, open:

    http://127.0.0.1:8000/docs

This provides interactive documentation for the available API endpoints.

---

## Security

Sensitive configuration values are stored in `.env`.

The following file should not be committed:

    .env

Use `.env.example` to provide the required environment variable names without exposing actual credentials.

### Sign-out and token revocation

A JWT cannot normally be taken back once it has been handed out: it is accepted
because it is correctly signed and has not expired, and the server keeps no
record of it to delete. Clearing it from the browser hides it; a copy taken
beforehand keeps working until it expires on its own.

Each user row therefore carries a `token_version`, which is copied into every
token issued to that account. Both the access-token check and the refresh
endpoint compare the two, and signing out increases the number - so every token
the account holds stops being accepted at once. Verified by hand: the same
token listed the user's documents, then returned 401 immediately after
`POST /auth/logout`, and the refresh token was refused too.

The cost of that simplicity is breadth. Revocation is account-wide, so signing
out on the laptop signs out the phone as well. Per-device revocation would need
an identifier stored per token.

### Known limitations

Stated deliberately, because a project that names what it does not protect is
more useful than one that says only "secure":

- **Tokens are kept in `localStorage`.** Any XSS vulnerability in the frontend, or a compromised npm dependency, can read them. Nothing above protects against that, since an attacker does not wait for the user to sign out. The usual mitigation is an `httpOnly` cookie for the refresh token, which JavaScript cannot reach at all.
- **No refresh-token reuse detection.** Refresh tokens are rotated on every use, but a stolen token replayed after the legitimate one is not noticed. Detecting it requires storing used tokens.
- **No rate limiting on login.** Nothing prevents repeated attempts against `/auth/login`.

---

## License

This project was developed as a university project.