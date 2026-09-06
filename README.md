# StudyMate

StudyMate is an AI-powered study assistant designed to help university students study from their own documents.

The system allows students to:

- Create an account and log in.
- Upload PDF study materials.
- Process uploaded documents using text extraction and embeddings.
- Ask questions about uploaded documents.
- Receive AI-generated answers based on the document content using RAG (Retrieval-Augmented Generation).
- View source passages and page references used to generate answers.
- Maintain conversations with the AI.
- Generate AI-powered quizzes from uploaded documents.
- Submit quiz answers and receive a score.

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
├── studymate-frontend/
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
- PostgreSQL
- PostgreSQL pgvector extension
- PostgreSQL pg_trgm extension
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

---

## Environment Variables

Create a `.env` file in the project root.

The required variables are:

    DATABASE_URL=
    SECRET_KEY=
    ANTHROPIC_API_KEY=
    CLAUDE_MODEL=

Use `.env.example` as a template.

Do not commit the `.env` file to GitHub because it may contain secrets such as API keys and database credentials.

---

## Database Setup

StudyMate uses PostgreSQL with the pgvector extension, and additionally uses PostgreSQL's built-in pg_trgm extension for hybrid (lexical + semantic) search on Arabic questions.

Make sure PostgreSQL is installed and running.

Create a PostgreSQL database and configure the `DATABASE_URL` variable in `.env`.

Example:

    DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/studymate

The application enables the pgvector extension when the database is initialized.

The pg_trgm extension must currently be enabled manually. Connect to the database and run:

    CREATE EXTENSION IF NOT EXISTS pg_trgm;

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

## Running Tests

The project includes an automated test suite (pytest) covering authentication, PDF/text-processing logic, and the RAG retrieval pipeline.

From the project root, with the virtual environment activated:

    python -m pytest tests -v

Use `python -m pytest` rather than a bare `pytest` command, to make sure the virtual environment's own installed packages are used rather than any global installation.

---

## AI and RAG

StudyMate uses a Retrieval-Augmented Generation (RAG) pipeline.

The main steps are:

1. A PDF document is uploaded.
2. Text is extracted from the PDF using PyMuPDF, with a Tesseract OCR fallback for pages where the extracted text looks incomplete or corrupted.
3. The document is divided into chunks.
4. Embeddings are generated using sentence-transformers.
5. Embeddings are stored in PostgreSQL using pgvector.
6. When a student sends a chat message, an input gate first checks whether it is trivial small talk (a greeting or a closing, in Arabic or English). If so, an instant canned reply is returned immediately without calling the AI pipeline.
7. Otherwise, relevant chunks are retrieved:
   - For English questions: a direct dense (embedding-based) similarity search.
   - For Arabic questions: a hybrid search that combines dense similarity with PostgreSQL trigram lexical similarity (pg_trgm) using Reciprocal Rank Fusion (RRF), then narrows the combined candidates further with a cross-encoder reranking model for more precise relevance.
8. The retrieved content is provided to the Claude model.
9. Claude generates an answer based on the retrieved document content.
10. The relevant source passages and page references are returned with the answer.

The embedding model used by the project is:

    all-MiniLM-L6-v2

The embedding dimension is:

    384

The reranking model used for Arabic questions is:

    cross-encoder/mmarco-mMiniLMv2-L12-H384-v1

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
- Retrieval-Augmented Generation (RAG) with hybrid search (dense + pg_trgm lexical search combined via Reciprocal Rank Fusion) for Arabic questions
- PDF text extraction using PyMuPDF (fitz), with Tesseract OCR (pytesseract) as a fallback for low-quality pages
- pyspellchecker, used to help judge extraction quality on English text

### Frontend

The `studymate-frontend/` directory contains the client-side application.

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

---

## License

This project was developed as a university project.