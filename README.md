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
│   ├── embedding_service.py
│   ├── rag_service.py
│   └── service.py
│
├── backend/
│   ├── auth.py
│   ├── database.py
│   ├── main.py
│   └── models.py
│
├── frontend/
│
├── uploads/
│
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
```

---

## Requirements

Before running the project, make sure you have:

- Python 3.11 or later
- PostgreSQL
- PostgreSQL pgvector extension
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

StudyMate uses PostgreSQL with the pgvector extension.

Make sure PostgreSQL is installed and running.

Create a PostgreSQL database and configure the `DATABASE_URL` variable in `.env`.

Example:

    DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/studymate

The application enables the pgvector extension when the database is initialized.

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

## AI and RAG

StudyMate uses a Retrieval-Augmented Generation (RAG) pipeline.

The main steps are:

1. A PDF document is uploaded.
2. Text is extracted from the PDF.
3. The document is divided into chunks.
4. Embeddings are generated using sentence-transformers.
5. Embeddings are stored in PostgreSQL using pgvector.
6. When a student asks a question, relevant chunks are retrieved.
7. The retrieved content is provided to the Claude model.
8. Claude generates an answer based on the retrieved document content.
9. The relevant source passages and page references are returned with the answer.

The embedding model used by the project is:

    all-MiniLM-L6-v2

The embedding dimension is:

    384

---

## Main Technologies

### Backend

- FastAPI
- SQLAlchemy
- PostgreSQL
- pgvector
- Pydantic
- JWT authentication

### AI

- Anthropic Claude API
- Sentence Transformers
- Retrieval-Augmented Generation (RAG)
- PDF text extraction using pypdf

### Frontend

The frontend directory contains the client-side application.

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