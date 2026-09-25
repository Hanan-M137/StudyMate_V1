# StudyMate

StudyMate is a study assistant for university students. Students upload their own documents and then ask questions about them and take quizzes generated from them, in Arabic or in English.

The system allows students to:

- Create an account, optionally confirm the email address with an emailed code, and log in.
- Upload PDF study materials, and Office documents (Word, PowerPoint, Excel, OpenDocument, RTF), which are converted to PDF with LibreOffice first.
- Process uploaded documents using text extraction, OCR and embeddings.
- Ask questions about uploaded documents and continue earlier conversations.
- Receive AI-generated answers based on the document content using RAG (Retrieval-Augmented Generation), rendered as Markdown.
- View the pages the answer actually cited.
- Get an answer from general knowledge, clearly marked as such, when the question is not covered by the document.
- Receive the answer in the language the question was asked in.
- Generate quizzes from uploaded documents, choosing how many questions, which question types, an optional page range, and what the quiz should focus on.
- Submit quiz answers and receive a score, with written answers judged on meaning rather than exact wording.
- See the correct answers, explanations and source pages after submitting.
- Review every past attempt at a quiz, and delete an attempt.
- Rename documents, conversations and quizzes, and pin conversations and quizzes to the top of their lists.
- Delete documents, conversations, quizzes, and the whole account.
- Change their name and password, and send a message through a contact form.
- Use the interface in English or Arabic (right-to-left), in a light or dark theme, and dictate a question by voice where the browser supports it.
- Sign out, with every token issued to the account revoked on the server.

---

## Project Structure

```text
StudyMate/

├── ai/
│   ├── anthropic_client.py
│   ├── convert.py              Office -> PDF conversion (LibreOffice)
│   ├── embedding_service.py
│   ├── input_gate.py
│   ├── rag_service.py
│   ├── reranker_service.py
│   └── service.py              PDF extraction, OCR, chunking, quizzes, grading
│
├── backend/
│   ├── auth.py
│   ├── database.py
│   ├── email_service.py        SMTP: verification codes, contact notifications
│   ├── main.py                 FastAPI app and every endpoint
│   └── models.py
│
├── frontend/
│   └── studymate-web/          React + Vite client (has its own README)
│
├── tests/
│   ├── test_auth.py
│   ├── test_password_rules.py
│   ├── test_rag_service.py
│   ├── test_service.py
│   └── test_token_version.py
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

- Python 3.12 or later. The pinned numpy 2.5 and scipy 1.18 do not install on 3.11. The project is developed on Python 3.14.
- Node.js 20.19 or later, or 22.12 or later, for the frontend. These are the minimums Vite 8 and its React plugin declare.
- PostgreSQL, with the pgvector extension installed on the server. pg_trgm ships with PostgreSQL.
- An Anthropic API key.

### System programs pip cannot install

- **Tesseract OCR**, with the Arabic language data (`ara`) as well as English (`eng`). Every page is OCR'd in whichever of the two the page's text looks like. If Tesseract is missing entirely, OCR is skipped with a warning and only the PDF's own text is used. If Tesseract is installed without `ara`, OCR of an Arabic page raises an error that is not caught, so the document most likely ends up `failed`. That outcome comes from reading the code, not from testing it.
- **LibreOffice**, only if Office uploads are wanted. It is found automatically in its usual install location or on PATH, or it can be set with `SOFFICE_CMD`. Without it, PDF uploads still work. Set `ENABLE_FILE_CONVERSION=false` to refuse Office files outright.
- **An SMTP account**, only if email verification or contact-form notifications are wanted. See the environment variables below.

### Models downloaded on first run

Three models are downloaded from Hugging Face the first time they are used, and cached under `~/.cache/huggingface/hub`. The download is about 1 GB, so the first question, or the first document processed, is slow and needs internet access:

| Model | Size on disk |
|---|---|
| `intfloat/multilingual-e5-small` | ~470 MB |
| `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | ~470 MB |
| `sentence-transformers/all-MiniLM-L6-v2` | ~90 MB |

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

**On Linux, install the CPU build of PyTorch first.** `requirements.txt` pins `torch==2.13.0` from PyPI. On Windows that is a CPU-only build, and it is what this project runs on. On Linux the same PyPI package also pulls in NVIDIA CUDA libraries, several gigabytes of them, which nothing here needs. To avoid that, install torch from PyTorch's CPU index before the rest:

    pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
    pip install -r requirements.txt

### 4. Install the frontend dependencies

    cd frontend\studymate-web
    npm install

---

## Environment Variables

Create a `.env` file in the project root, using `.env.example` as a template.

The required variables are:

    DATABASE_URL=
    SECRET_KEY=
    ANTHROPIC_API_KEY=
    CLAUDE_MODEL=

The optional variables are:

    CLAUDE_FAST_MODEL=
    TESSERACT_CMD=
    SOFFICE_CMD=
    ENABLE_FILE_CONVERSION=true
    MAX_UPLOAD_MB=200
    MAX_CONVERT_MB=100
    REQUIRE_EMAIL_VERIFICATION=false
    CONTACT_EMAIL_TO=
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=
    SMTP_PASSWORD=
    SMTP_FROM=

`CLAUDE_FAST_MODEL` selects a cheaper model for the small calls: grading a written quiz answer, and rewriting a follow-up question so it can be searched on its own. When it is unset, those calls use `CLAUDE_MODEL`.

`TESSERACT_CMD` is the full path to the Tesseract executable. Windows installs Tesseract outside PATH, so the path has to be given here:

    TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

On Linux and macOS it is normally on PATH already and the variable can be left out entirely.

`SOFFICE_CMD` is the path to LibreOffice. Leave it empty to auto-detect. On Windows it must point at `soffice.com`, not `soffice.exe`, because the `.exe` detaches and reports success before the conversion has finished.

`ENABLE_FILE_CONVERSION` turns Office uploads on or off. Only `true`, `1`, `yes` or `on` count as on, so a typo turns the feature off.

`MAX_UPLOAD_MB` caps every upload. `MAX_CONVERT_MB` caps only files that have to be converted, because conversion takes about 2 seconds per megabyte. An unreadable value in either falls back to the default.

`REQUIRE_EMAIL_VERIFICATION=true` makes new accounts confirm their address with an emailed code before they can log in. It needs `SMTP_HOST` and `SMTP_PASSWORD`. Without them the server logs a warning at startup and runs with verification off.

`CONTACT_EMAIL_TO` and the `SMTP_*` variables control email. Contact-form messages are always stored in the database, and the email notification is skipped when SMTP is not configured. With Gmail, `SMTP_PASSWORD` is an App Password, which requires 2-step verification on that account. It is not the account password.

The frontend reads one variable of its own, `VITE_API_URL`, from `frontend/studymate-web/.env`. See that folder's `.env.example`. When it is unset, the frontend calls `http://localhost:8000`.

Do not commit the `.env` file to GitHub because it may contain secrets such as API keys and database credentials.

---

## Database Setup

StudyMate uses PostgreSQL with the pgvector extension for embeddings, and PostgreSQL's pg_trgm extension for the lexical half of hybrid search.

Make sure PostgreSQL is installed and running, with pgvector installed on the server.

Create a PostgreSQL database and configure the `DATABASE_URL` variable in `.env`.

Example:

    DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/studymate

On startup the application runs `CREATE EXTENSION IF NOT EXISTS` for both `vector` and `pg_trgm`, and then creates any missing tables. The database user therefore needs permission to create extensions the first time. Otherwise, create the extensions once by hand:

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

### A note on schema changes

The project has no migration tool. Tables are created from the SQLAlchemy models on startup, which creates missing tables but never alters an existing one. A column added to a model therefore reaches a fresh database automatically, but an existing database not at all, so the change has to be applied by hand.

A database created before these columns existed needs:

    ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

    -- Existing accounts count as verified, so switching verification on
    -- does not lock them out; new accounts get the value from the code.
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ALTER COLUMN email_verified DROP DEFAULT;

    ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE quizzes ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE quiz_attempts ADD COLUMN duration_seconds INTEGER;

The `contact_messages` and `email_verifications` tables are new tables and are created automatically.

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

The frontend runs at `http://localhost:5173`. The backend accepts browser requests from that origin only (CORS in `backend/main.py`), so if Vite picks another port because 5173 is taken, requests will fail until the origin is added there.

---

## Running Tests

The project includes an automated test suite (pytest, 128 tests) covering authentication and token revocation, password rules, PDF and text-processing logic, quiz content selection, and the RAG retrieval pipeline.

From the project root, with the virtual environment activated:

    python -m pytest tests -v

Use `python -m pytest` rather than a bare `pytest` command, to make sure the virtual environment's own installed packages are used rather than any global installation.

---

## Document Processing

A document is processed once, when it is uploaded, and never read again: every question and every quiz afterwards works from the stored text. The processing runs in the background, so the upload request returns immediately and the document's status moves from `pending` to `processing` to `ready`, or to `failed`.

An Office document is first converted to PDF with LibreOffice, and from then on it is handled exactly like an uploaded PDF.

Every page is read **twice**: once directly from the PDF's own text layer in visual reading order, and once by rendering the page at 300 DPI and running OCR on it, in Arabic or English depending on the page. The two results are then compared and the better one is kept. A candidate is never judged on its own, because neither method is reliably better: OCR rescues a scanned page, and ruins a vocalized Arabic one.

Two problems specific to Arabic textbooks are handled before that comparison:

**Broken font encoding.** Some Arabic PDFs embed a font whose character map is wrong: the shape drawn on the page is correct, but the code point the extractor reads belongs to another script entirely. In the textbook this project was tested against, three separate characters (Latin, Cyrillic and Armenian) all stood for alef, one per font used in the book, affecting 1777 characters across 118 of its 120 pages. The same extractor also wrote hamza-alef as two characters. Both are repaired before anything else looks at the text.

**OCR losing the Arabic.** When OCR fails on an Arabic page it does not return *less* text, it returns more: words broken into single letters, and decorative borders read as long strings of punctuation. Every length-based or character-based quality rule therefore reads a failed OCR result as an improvement. Average Arabic word length separates the two reliably, but only as a comparison between the two candidates for the same page. Measured across the affected pages, the two ranges overlap, so no fixed threshold can split them.

The chosen text is split into chunks of about 700 characters with 100 characters of overlap, each carrying its page number.

---

## AI and RAG

StudyMate uses a Retrieval-Augmented Generation (RAG) pipeline.

The main steps are:

1. A document is uploaded and processed as described above.
2. The document is divided into chunks, each carrying its page number.
3. Embeddings are generated using sentence-transformers and stored in PostgreSQL using pgvector.
4. When a student sends a chat message, an input gate first checks whether it is trivial small talk, such as a greeting or a closing. If it is, a canned reply in the message's language is returned immediately and the AI pipeline is not called. English messages are checked against a list of phrases and then by similarity with a small embedding model. Arabic messages are checked only by exact match after normalisation (diacritics, alef forms, attached و/ف/ب and ال are folded), never by the model. The model's scores could not separate Arabic greetings from real Arabic questions.
5. Relevant chunks are retrieved by hybrid search: dense (embedding-based) similarity combined with two PostgreSQL trigram rankings (pg_trgm `similarity` and `word_similarity`) through Reciprocal Rank Fusion (RRF, k = 60). The two kinds of search answer different questions. One knows that "أنثى الأسد" and "اللبؤة" mean the same thing, and the other catches a name or a number literally. A chunk that appears high in several lists outranks one that led a single list.
6. The top 20 candidates are re-scored by a cross-encoder reranking model, which reads the question and the passage together rather than embedding each on its own. The best 5 are kept.
7. The **highest** rerank score decides the path. Above the threshold, the retrieved chunks are sent to Claude, which answers from them and cites pages.
8. If nothing clears the threshold and the conversation already has earlier messages, the question is rewritten into a standalone one and the search is run again. A follow-up such as "and why?" cannot be searched for as it is. The rewrite happens only on this retry, so a question that already finds its answer costs no extra call.
9. If there is still nothing, no document text is sent. The question is answered from general knowledge, and the student is told the answer did not come from their document.
10. The sources displayed are the pages Claude actually cited, not the pages that scored well.

Two design decisions in that pipeline are worth stating plainly, because both were arrived at by measurement after the obvious version failed:

**The threshold is applied to the best chunk, not to each chunk.** Filtering chunk by chunk looks reasonable and is wrong. A page reading literally "اللبؤة: أنثى الأسد" scored -1.06 with this reranker, while a page that merely mentioned hunting scored +0.59, so the definition was discarded and the allusion survived. The reranker orders Arabic passages well, but its absolute scale sits low, which makes it a good sorter and a bad judge. Sorting is what it is now asked to do, and the reading is left to Claude.

**The threshold value sits inside a measured gap, not at zero.** Across real questions, passages whose answer was in the document scored +0.59 to +5.24 in Arabic and +1.39 to +7.42 in English. Questions the document did not cover scored -2.74 to -0.08 in Arabic and -6.04 to -3.51 in English. The value in the code (0.25) sits inside both gaps. It is not a percentage and means nothing on its own: if the reranker is swapped, the threshold has to be measured again.

### Answers

Claude is told to answer in the language of the question, fully in Arabic or fully in English and never mixed, and to keep formatting light. That means no emojis and no `#` or `##` headings, with `###` subheadings only for answers that really have sections. Bold is limited to key terms, and bullet points or a simple table are used only when the question asks for a list or a comparison. The frontend renders the answer as GitHub-flavoured Markdown (`react-markdown` with `remark-gfm`), so tables and bold display properly instead of as raw symbols.

In an Arabic answer, code (both blocks and inline snippets) is laid out left-to-right on its own. Otherwise brackets and punctuation reorder, and `if (x) {` reads as `{ (x) if`.

### Models

Four models are used, three of them local and free:

| Purpose | Model | Where |
|---|---|---|
| Retrieval embeddings | `intfloat/multilingual-e5-small` (384 dimensions) | `ai/embedding_service.py` |
| Input gate (English messages only) | `all-MiniLM-L6-v2` | `ai/embedding_service.py`, used by `ai/input_gate.py` |
| Reranking | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | `ai/reranker_service.py` |
| Answering, question rewriting, quiz generation, grading written answers | Anthropic Claude (`CLAUDE_MODEL`, and `CLAUDE_FAST_MODEL` for rewriting and grading) | `ai/anthropic_client.py` |

The retrieval model requires the prefixes `query: ` and `passage: ` on the two kinds of text. They are not decoration: results are worse without them, and worse still with the wrong one, without any error to show it.

The input gate deliberately keeps its own model rather than sharing the retrieval one. It works by comparing a message against reference phrases and testing the result against a fixed threshold, and the retrieval model compresses nearly every score into a narrow band. Measured, the gap between a greeting and a real question fell from 0.1285 to 0.0022, which is no gap at all. An absolute threshold needs a stable scale more than it needs multilingual understanding.

---

## Quizzes

A quiz is generated from the document by Claude. It is given up to 100 chunks sampled evenly across the whole document, or across a page range the student chooses, rather than only the opening pages.

When creating a quiz, the student chooses:

- how many questions to generate, from 1 to 50;
- which of the three question types to include: multiple choice, true/false, or short answer;
- optionally, a first and last page;
- optionally, what the quiz should concentrate on.

The chosen types are enforced twice: the prompt is told, and anything outside them is dropped before the questions are saved. A model told to produce one type will still slip in another.

Multiple choice and true/false answers are compared as strings, which is what they are. Written answers are not: measured over the stored questions, the average correct answer is 16.9 words long, and only 2 of 24 are short enough for any string comparison to work. They are judged by Claude on meaning instead, and each gets one of three verdicts: correct, partially correct, or incorrect. Each verdict comes with a short explanation written to the student saying what was right and what was missing. A partially correct answer earns the mark and says so.

After submitting, the correct answer is revealed. The right option is marked in the list, a written question shows the model answer beside what the student wrote, and the stored explanation and the page the question came from are shown. The correct answer and the explanation are not sent to the browser before the quiz is submitted.

Past attempts are listed on the quiz page and can be opened question by question, or deleted. The score is stored, but the per-question verdicts are not. Choice questions are therefore re-compared on the spot, which is free and identical to the original marking. A written answer is shown beside the model answer without a mark, since re-judging it would be a paid call that could disagree with the mark the student already saw.

---

## Arabic Support

- **Answers** are written in the question's language (see *Answers* above).
- **The interface** is fully translated. In Arabic, the whole page switches to right-to-left, and an Arabic font (IBM Plex Sans Arabic) is used, because the Latin fonts have no Arabic glyphs.
- **Mixed text** is placed by its content, not by the interface language. Chat messages and source passages are laid out right-to-left or left-to-right according to their text, so an English answer reads correctly in the Arabic interface and the other way round. Code always stays left-to-right.
- **Documents** in Arabic are handled as described under *Document Processing*, and retrieval is the same for both languages, because the embedding and reranking models are multilingual.

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
- SMTP email through Python's standard library

### AI

- Anthropic Claude API
- Sentence Transformers (embeddings and cross-encoder reranking)
- Retrieval-Augmented Generation (RAG) with hybrid search (dense + pg_trgm lexical search combined via Reciprocal Rank Fusion)
- PDF text extraction using PyMuPDF (fitz), with Tesseract OCR (pytesseract) compared against it page by page
- pyspellchecker, used to help judge extraction quality on English text
- LibreOffice (external program) for converting Office documents to PDF

### Frontend

- React with Vite
- React Router
- Tailwind CSS
- axios
- react-markdown and remark-gfm

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

Passwords must be at least 8 characters long and contain at least one letter and one digit. The rule applies at registration and when a password is changed, not at login, so older accounts are not locked out.

### Sign-out and token revocation

A JWT cannot normally be taken back once it has been handed out. It is accepted because it is correctly signed and has not expired, and the server keeps no record of it to delete. Clearing it from the browser hides it, but a copy taken beforehand keeps working until it expires on its own.

Each user row therefore carries a `token_version`, which is copied into every token issued to that account. Both the access-token check and the refresh endpoint compare the two, and signing out increases the number, so every token the account holds stops being accepted at once. Verified by hand: the same token listed the user's documents, then returned 401 immediately after `POST /auth/logout`, and the refresh token was refused too.

The cost of that simplicity is breadth. Revocation is account-wide, so signing out on the laptop signs out the phone as well. Per-device revocation would need an identifier stored per token.

Access tokens last 60 minutes and refresh tokens 7 days.

### Account deletion

Deleting an account (`DELETE /auth/me`) requires the current password. It removes the user and, through `ON DELETE CASCADE`, every document, chunk, conversation, message, quiz, attempt, contact message and verification code belonging to it. The uploaded files are removed from disk afterwards. Deletion is permanent: there is no recovery period.

### Known limitations

Stated deliberately, because a project that names what it does not protect is more useful than one that says only "secure":

- **Tokens are kept in `localStorage`.** Any XSS vulnerability in the frontend, or a compromised npm dependency, can read them. Nothing above protects against that, since an attacker does not wait for the user to sign out. The usual mitigation is an `httpOnly` cookie for the refresh token, which JavaScript cannot reach at all.
- **No refresh-token reuse detection.** Refresh tokens are rotated on every use, but a stolen token replayed after the legitimate one is not noticed. Detecting it requires storing used tokens.
- **No rate limiting on login.** Nothing prevents repeated attempts against `/auth/login`. Only resending a verification code and the contact form are rate-limited.
- **A quiz question's source page is sent before submission.** The interface hides it until the quiz is submitted, but `GET /quizzes/{id}` includes `source_page` for every question, so it can be read from the network response.
- **No migration tool.** Schema changes to an existing database are applied by hand (see *Database Setup*).
- **CORS allows only `http://localhost:5173`.** Any other frontend origin has to be added in `backend/main.py`.

---

## License

This project was developed as a university project.
