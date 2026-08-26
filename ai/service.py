import json
import logging
import os
import re
from pathlib import Path
from uuid import UUID

from anthropic import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    RateLimitError,
)

from dotenv import load_dotenv
from pypdf import PdfReader
from sqlalchemy.orm import Session

from backend.database import SessionLocal

from backend.models import (
    Chunk,
    Document,
    Quiz,
    QuizQuestion,
)

from .anthropic_client import get_anthropic_client
from .embedding_service import generate_embeddings


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# LOGGING
# =========================================================

logger = logging.getLogger(__name__)


# =========================================================
# DOCUMENT PROCESSING SETTINGS
# =========================================================

CHUNK_SIZE = 700
CHUNK_OVERLAP = 100


# =========================================================
# QUIZ SETTINGS
# =========================================================

DEFAULT_QUESTION_COUNT = 10

# Maximum number of document chunks that can be
# sent to Claude during quiz generation.
MAX_QUIZ_CHUNKS = 100


# =========================================================
# CLEAN PDF TEXT
# =========================================================

def clean_text(text: str) -> str:
    """
    Clean extracted PDF text.

    - Fix broken line breaks
    - Remove excessive whitespace
    - Keep paragraph boundaries where possible
    """

    if not text:
        return ""

    # Replace Windows-style line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Join words split with a hyphen at the end of a line
    text = re.sub(
        r"(\w)-\n(\w)",
        r"\1\2",
        text,
    )

    # Replace single line breaks with spaces
    text = re.sub(
        r"(?<!\n)\n(?!\n)",
        " ",
        text,
    )

    # Collapse repeated spaces and tabs
    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    # Collapse excessive blank lines
    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text,
    )

    return text.strip()


# =========================================================
# SPLIT TEXT INTO CHUNKS
# =========================================================

def split_text_into_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Split text into overlapping chunks.

    The function tries to end chunks at a sentence
    or space rather than cutting directly in the
    middle of a word.
    """

    if not text:
        return []

    if chunk_size <= 0:
        raise ValueError(
            "chunk_size must be greater than zero"
        )

    if overlap < 0:
        raise ValueError(
            "overlap cannot be negative"
        )

    if overlap >= chunk_size:
        raise ValueError(
            "overlap must be smaller than chunk_size"
        )

    chunks = []

    start = 0
    text_length = len(text)

    while start < text_length:

        target_end = min(
            start + chunk_size,
            text_length,
        )

        end = target_end

        if target_end < text_length:

            search_start = (
                start + chunk_size // 2
            )

            section = text[
                search_start:target_end
            ]

            # Prefer ending after sentence punctuation
            sentence_positions = [
                section.rfind(". "),
                section.rfind("? "),
                section.rfind("! "),
                section.rfind("\n"),
            ]

            best_position = max(
                sentence_positions
            )

            if best_position != -1:

                end = (
                    search_start
                    + best_position
                    + 1
                )

            else:

                # Otherwise, end at the last space
                last_space = text.rfind(
                    " ",
                    search_start,
                    target_end,
                )

                if last_space != -1:
                    end = last_space

        chunk = text[
            start:end
        ].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        next_start = end - overlap

        # Protection against infinite loop
        if next_start <= start:
            next_start = end

        start = next_start

    return chunks


# =========================================================
# EXTRACT PDF CHUNKS
# =========================================================

def extract_pdf_chunks(
    file_path: str,
) -> list[dict]:
    """
    Extract and chunk a PDF page by page.

    Each returned chunk contains:

    - content
    - page_number
    - chunk_index
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"PDF file was not found: {file_path}"
        )

    reader = PdfReader(
        str(path)
    )

    extracted_chunks = []

    chunk_index = 0

    for page_number, page in enumerate(
        reader.pages,
        start=1,
    ):

        raw_text = (
            page.extract_text()
            or ""
        )

        cleaned_text = clean_text(
            raw_text
        )

        if not cleaned_text:
            continue

        page_chunks = (
            split_text_into_chunks(
                cleaned_text,
                chunk_size=CHUNK_SIZE,
                overlap=CHUNK_OVERLAP,
            )
        )

        for chunk_text in page_chunks:

            extracted_chunks.append(
                {
                    "content": chunk_text,
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                }
            )

            chunk_index += 1

    return extracted_chunks


# =========================================================
# PROCESS DOCUMENT
# =========================================================

def process_document(
    db: Session,
    document: Document,
) -> int:
    """
    Process one document and store its chunks
    and embeddings.

    Steps:

    1. Extract PDF text
    2. Split into chunks
    3. Generate embeddings
    4. Store chunks in PostgreSQL
    5. Mark document as ready

    Returns:
        Number of stored chunks.
    """

    document.status = "processing"

    db.commit()

    try:

        # -------------------------------------------------
        # Extract PDF text and create chunks
        # -------------------------------------------------

        extracted_chunks = (
            extract_pdf_chunks(
                document.file_path
            )
        )

        if not extracted_chunks:
            raise ValueError(
                "No readable text was found in the PDF"
            )

        logger.info(
            "Document %s: extracted %d chunks.",
            document.id,
            len(extracted_chunks),
        )

        # -------------------------------------------------
        # Generate embeddings
        # -------------------------------------------------

        chunk_texts = [
            item["content"]
            for item in extracted_chunks
        ]

        embeddings = generate_embeddings(
            chunk_texts
        )

        if len(embeddings) != len(extracted_chunks):
            raise RuntimeError(
                "The number of generated embeddings "
                "does not match the number of chunks."
            )

        # -------------------------------------------------
        # Delete old chunks if document is
        # processed again
        # -------------------------------------------------

        (
            db.query(Chunk)
            .filter(
                Chunk.document_id
                == document.id
            )
            .delete(
                synchronize_session=False
            )
        )

        # -------------------------------------------------
        # Store chunks + embeddings
        # -------------------------------------------------

        for item, embedding in zip(
            extracted_chunks,
            embeddings,
        ):

            chunk = Chunk(
                document_id=document.id,
                content=item["content"],
                page_number=item["page_number"],
                chunk_index=item["chunk_index"],
                embedding=embedding,
            )

            db.add(chunk)

        # -------------------------------------------------
        # Update document information
        # -----------------------------------------------------

        reader = PdfReader(
            document.file_path
        )

        document.page_count = len(
            reader.pages
        )

        document.status = "ready"

        # -------------------------------------------------
        # Commit everything
        # -------------------------------------------------

        db.commit()

        db.refresh(document)

        logger.info(
            "Document %s processed successfully. "
            "Stored %d chunks.",
            document.id,
            len(extracted_chunks),
        )

        return len(extracted_chunks)

    except Exception:

        # -------------------------------------------------
        # Rollback failed transaction
        # -------------------------------------------------

        db.rollback()

        document = (
            db.query(Document)
            .filter(
                Document.id
                == document.id
            )
            .first()
        )

        if document:

            document.status = "failed"

            db.commit()

        logger.exception(
            "Failed to process document %s.",
            document.id,
        )

        raise


# =========================================================
# BACKGROUND DOCUMENT PROCESSING
# =========================================================

def process_document_background(
    document_id: UUID,
) -> None:
    """
    Background-task wrapper.

    It creates a new database session because
    the request session is closed after the
    HTTP response is returned.
    """

    db = SessionLocal()

    try:

        # -------------------------------------------------
        # Find document
        # -------------------------------------------------

        document = (
            db.query(Document)
            .filter(
                Document.id
                == document_id
            )
            .first()
        )

        if not document:

            logger.warning(
                "Background processing: "
                "document %s was not found.",
                document_id,
            )

            return

        # -------------------------------------------------
        # Process document
        # -------------------------------------------------

        process_document(
            db,
            document,
        )

    finally:

        # -------------------------------------------------
        # Always close database session
        # -------------------------------------------------

        db.close()


# =========================================================
# GET CLAUDE MODEL
# =========================================================

def get_claude_model() -> str:
    """
    Get Claude model ID from .env.

    This is the single place responsible for
    retrieving the Claude model configuration.
    """

    model = os.getenv(
        "CLAUDE_MODEL"
    )

    if not model:

        raise RuntimeError(
            "CLAUDE_MODEL is missing "
            "from the .env file"
        )

    return model


# =========================================================
# GET DOCUMENT CHUNKS
# =========================================================

def get_document_chunks(
    db: Session,
    document_id: UUID,
) -> list[Chunk]:
    """
    Get all chunks belonging to a document.

    Chunks are ordered according to their
    original chunk_index.
    """

    chunks = (
        db.query(Chunk)
        .filter(
            Chunk.document_id
            == document_id
        )
        .order_by(
            Chunk.chunk_index
        )
        .all()
    )

    return chunks


# =========================================================
# SELECT QUIZ CHUNKS
# =========================================================

def select_quiz_chunks(
    chunks: list[Chunk],
    max_chunks: int = MAX_QUIZ_CHUNKS,
) -> list[Chunk]:
    """
    Select a limited number of chunks for quiz generation.

    If the document contains fewer chunks than the limit,
    all chunks are returned.

    If the document contains more chunks than the limit,
    chunks are selected approximately evenly across the
    entire document.

    This prevents very large documents from sending every
    chunk to Claude while still giving the model content
    from the beginning, middle, and end of the document.
    """

    if max_chunks < 1:
        raise ValueError(
            "max_chunks must be at least 1."
        )

    total_chunks = len(chunks)

    logger.debug(
        "Quiz chunk selection: total_chunks=%d, "
        "max_chunks=%d",
        total_chunks,
        max_chunks,
    )

    if total_chunks <= max_chunks:

        logger.info(
            "Quiz generation: using all %d document chunks. "
            "No chunks were dropped.",
            total_chunks,
        )

        return chunks

    # -----------------------------------------------------
    # Calculate evenly distributed indexes
    # -----------------------------------------------------

    if max_chunks == 1:

        selected_indexes = [0]

    else:

        selected_indexes = [
            round(
                i
                * (total_chunks - 1)
                / (max_chunks - 1)
            )
            for i in range(max_chunks)
        ]

    selected_chunks = [
        chunks[index]
        for index in selected_indexes
    ]

    dropped_chunks = (
        total_chunks
        - len(selected_chunks)
    )

    logger.info(
        "Quiz generation: document contains %d chunks. "
        "Using %d chunks distributed across the document "
        "and dropping %d chunks.",
        total_chunks,
        len(selected_chunks),
        dropped_chunks,
    )

    return selected_chunks


# =========================================================
# BUILD QUIZ CONTEXT
# =========================================================

def build_quiz_context(
    chunks: list[Chunk],
) -> str:
    """
    Build the document context that will be
    sent to Claude.

    Each chunk contains its page number so
    Claude can identify the source page.
    """

    sections = []

    for number, chunk in enumerate(
        chunks,
        start=1,
    ):

        section = (
            f"SOURCE {number}\n"
            f"PAGE: {chunk.page_number}\n\n"
            f"{chunk.content}"
        )

        sections.append(
            section
        )

    return "\n\n---\n\n".join(
        sections
    )


# =========================================================
# GENERATE QUIZ WITH CLAUDE
# =========================================================

def generate_quiz_with_claude(
    context: str,
    question_count: int = DEFAULT_QUESTION_COUNT,
) -> list[dict]:
    """
    Ask Claude to generate quiz questions
    using ONLY the supplied document context.

    The generated quiz supports:

    - multiple_choice
    - true_false
    - short_answer

    Returns a list of dictionaries.
    """

    # -----------------------------------------------------
    # Get shared Anthropic client
    # -----------------------------------------------------

    client = get_anthropic_client()

    model = get_claude_model()

    # -----------------------------------------------------
    # System prompt
    # -----------------------------------------------------

    system_prompt = """
You are StudyMate, an AI quiz generator
for university students.

Your task is to generate quiz questions
using ONLY the provided document context.

Do NOT use outside knowledge.

Generate a mixture of:

- multiple choice questions
- true/false questions
- short answer questions

Every question must contain:

{
    "question_text": "...",
    "question_type": "multiple_choice | true_false | short_answer",
    "options": {...},
    "correct_answer": "...",
    "explanation": "...",
    "source_page": 1
}

Rules:

1. Use ONLY information found in the document.
2. Do not invent information.
3. Every question must have a correct answer.
4. Multiple choice questions must have exactly 4 options.
5. True/false questions must have:
   {
       "true": "True",
       "false": "False"
   }
6. Short answer questions must have:
   "options": null
7. source_page must be the page where the
   information used for the question appears.
8. Return ONLY valid JSON.
9. Do not return Markdown.
10. Do not wrap the JSON in ```json.
11. The JSON must be an array.
12. Make questions clear and educational.
13. Avoid creating multiple questions that
    test exactly the same information.
""".strip()

    # -----------------------------------------------------
    # User prompt
    # -----------------------------------------------------

    user_prompt = f"""
DOCUMENT CONTEXT:

{context}

TASK:

Generate exactly {question_count}
quiz questions from the document.

Return ONLY a valid JSON array.

Each item must follow this structure:

{{
    "question_text": "...",
    "question_type": "multiple_choice",
    "options": {{
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
    }},
    "correct_answer": "A",
    "explanation": "...",
    "source_page": 1
}}

For true/false:

{{
    "question_text": "...",
    "question_type": "true_false",
    "options": {{
        "true": "True",
        "false": "False"
    }},
    "correct_answer": "true",
    "explanation": "...",
    "source_page": 1
}}

For short answer:

{{
    "question_text": "...",
    "question_type": "short_answer",
    "options": null,
    "correct_answer": "...",
    "explanation": "...",
    "source_page": 1
}}
""".strip()

    # -----------------------------------------------------
    # Call Claude
    # -----------------------------------------------------

    logger.info(
        "Generating %d quiz questions using Claude model '%s'.",
        question_count,
        model,
    )

    try:

        response = client.messages.create(
            model=model,
            max_tokens=5000,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": user_prompt,
                }
            ],
        )

    except RateLimitError as error:

        logger.warning(
            "Anthropic rate limit reached."
        )

        raise RuntimeError(
            "The AI service rate limit was reached. "
            "Please try again later."
        ) from error

    except APITimeoutError as error:

        logger.error(
            "Anthropic request timed out."
        )

        raise RuntimeError(
            "The AI service took too long to respond."
        ) from error

    except APIConnectionError as error:

        logger.error(
            "Could not connect to Anthropic."
        )

        raise RuntimeError(
            "Could not connect to the AI service."
        ) from error

    except APIStatusError as error:

        logger.error(
            "Anthropic API returned an error: %s",
            error,
        )

        raise RuntimeError(
            f"The AI service returned an error: {error}"
        ) from error

    # -----------------------------------------------------
    # Extract text from Claude response
    # -----------------------------------------------------

    text_parts = [
        block.text
        for block in response.content
        if block.type == "text"
    ]

    response_text = "\n".join(
        text_parts
    ).strip()

    if not response_text:

        raise RuntimeError(
            "Claude returned an empty quiz."
        )

    # -----------------------------------------------------
    # Remove accidental Markdown fences
    # -----------------------------------------------------

    if response_text.startswith(
        "```"
    ):

        response_text = re.sub(
            r"^```(?:json)?\s*",
            "",
            response_text,
        )

        response_text = re.sub(
            r"\s*```$",
            "",
            response_text,
        )

        response_text = response_text.strip()

    # -----------------------------------------------------
    # Parse JSON
    # -----------------------------------------------------

    try:

        questions = json.loads(
            response_text
        )

    except json.JSONDecodeError as error:

        logger.error(
            "Claude returned invalid JSON."
        )

        raise RuntimeError(
            "Claude returned invalid JSON "
            "while generating the quiz."
        ) from error

    # -----------------------------------------------------
    # Validate response type
    # -----------------------------------------------------

    if not isinstance(
        questions,
        list,
    ):

        raise RuntimeError(
            "Claude quiz response must be "
            "a JSON array."
        )

    logger.info(
        "Claude generated %d quiz questions.",
        len(questions),
    )

    return questions


# =========================================================
# SAVE QUIZ QUESTIONS
# =========================================================

def save_quiz_questions(
    db: Session,
    quiz: Quiz,
    questions: list[dict],
) -> list[QuizQuestion]:
    """
    Validate and save generated questions
    into the quiz_questions table.
    """

    saved_questions = []

    for question_data in questions:

        if not isinstance(
            question_data,
            dict,
        ):
            continue

        # -------------------------------------------------
        # Read fields
        # -------------------------------------------------

        question_text = question_data.get(
            "question_text"
        )

        question_type = question_data.get(
            "question_type"
        )

        options = question_data.get(
            "options"
        )

        correct_answer = question_data.get(
            "correct_answer"
        )

        explanation = question_data.get(
            "explanation"
        )

        source_page = question_data.get(
            "source_page"
        )

        # -------------------------------------------------
        # Validate common fields
        # -------------------------------------------------

        if not question_text:
            continue

        if not question_type:
            continue

        if correct_answer is None:
            continue

        question_text = str(
            question_text
        ).strip()

        question_type = str(
            question_type
        ).strip().lower()

        if not question_text:
            continue

        # -------------------------------------------------
        # Validate question type
        # -------------------------------------------------

        if question_type == "multiple_choice":

            if not isinstance(
                options,
                dict,
            ):
                continue

            if len(options) != 4:
                continue

            required_options = {
                "A",
                "B",
                "C",
                "D",
            }

            if set(options.keys()) != required_options:
                continue

            normalized_options = {}

            for option_key in (
                "A",
                "B",
                "C",
                "D",
            ):

                option_value = options.get(
                    option_key
                )

                if option_value is None:
                    break

                normalized_options[
                    option_key
                ] = str(
                    option_value
                ).strip()

            else:

                normalized_answer = str(
                    correct_answer
                ).upper().strip()

                if normalized_answer in required_options:

                    options = normalized_options
                    correct_answer = normalized_answer

                else:
                    continue

        elif question_type == "true_false":

            options = {
                "true": "True",
                "false": "False",
            }

            normalized_answer = str(
                correct_answer
            ).lower().strip()

            if normalized_answer not in {
                "true",
                "false",
            }:

                continue

            correct_answer = normalized_answer

        elif question_type == "short_answer":

            options = None

            correct_answer = str(
                correct_answer
            ).strip()

            if not correct_answer:
                continue

        else:

            continue

        # -------------------------------------------------
        # Validate source page
        # -------------------------------------------------

        if source_page is not None:

            try:

                source_page = int(
                    source_page
                )

                if source_page < 1:
                    source_page = None

            except (
                TypeError,
                ValueError,
            ):

                source_page = None

        # -------------------------------------------------
        # Determine question index
        # -------------------------------------------------

        question_index = len(
            saved_questions
        )

        # -------------------------------------------------
        # Create QuizQuestion
        # -------------------------------------------------

        quiz_question = QuizQuestion(
            quiz_id=quiz.id,
            question_index=question_index,
            question_text=question_text,
            question_type=question_type,
            options=options,
            correct_answer=str(
                correct_answer
            ),
            explanation=(
                str(explanation).strip()
                if explanation
                else None
            ),
            source_page=source_page,
        )

        db.add(
            quiz_question
        )

        saved_questions.append(
            quiz_question
        )

    # -----------------------------------------------------
    # Make sure at least one question exists
    # -----------------------------------------------------

    if not saved_questions:

        raise RuntimeError(
            "No valid quiz questions were generated."
        )

    # -----------------------------------------------------
    # Make sure we do not silently return
    # far fewer questions than requested
    # -----------------------------------------------------

    logger.info(
        "Validated %d quiz questions.",
        len(saved_questions),
    )

    # -----------------------------------------------------
    # Commit
    # -----------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        logger.exception(
            "Failed to save quiz questions "
            "for quiz %s.",
            quiz.id,
        )

        raise

    # -----------------------------------------------------
    # Refresh questions
    # -----------------------------------------------------

    for question in saved_questions:

        db.refresh(question)

    return saved_questions


# =========================================================
# COMPLETE QUIZ GENERATION PIPELINE
# =========================================================

def generate_quiz(
    db: Session,
    quiz: Quiz,
    question_count: int = DEFAULT_QUESTION_COUNT,
) -> list[QuizQuestion]:
    """
    Complete AI quiz generation pipeline.

    This is the single quiz-generation entry point
    used by the FastAPI endpoint in main.py.

    Flow:

        Quiz
          ↓
        Document
          ↓
        All Chunks
          ↓
        Select limited/distributed Chunks
          ↓
        Build context
          ↓
        Claude
          ↓
        JSON questions
          ↓
        Validate
          ↓
        quiz_questions table
    """

    # -----------------------------------------------------
    # Validate question count
    # -----------------------------------------------------

    if question_count < 1:

        raise ValueError(
            "question_count must be at least 1."
        )

    if question_count > 50:

        raise ValueError(
            "question_count cannot exceed 50."
        )

    # -----------------------------------------------------
    # Check document status
    # -----------------------------------------------------

    document = (
        db.query(Document)
        .filter(
            Document.id
            == quiz.document_id
        )
        .first()
    )

    if not document:

        raise ValueError(
            "Document not found."
        )

    if document.status != "ready":

        raise ValueError(
            f"Document is not ready. "
            f"Current status: {document.status}"
        )

    # -----------------------------------------------------
    # Get all document chunks
    # -----------------------------------------------------

    all_chunks = get_document_chunks(
        db=db,
        document_id=quiz.document_id,
    )

    if not all_chunks:

        raise ValueError(
            "No chunks found for this document."
        )

    logger.info(
        "Quiz %s: found %d chunks for document %s.",
        quiz.id,
        len(all_chunks),
        quiz.document_id,
    )

    # -----------------------------------------------------
    # Select limited quiz chunks
    # -----------------------------------------------------

    chunks = select_quiz_chunks(
        chunks=all_chunks,
        max_chunks=MAX_QUIZ_CHUNKS,
    )

    if not chunks:

        raise ValueError(
            "No chunks were selected for quiz generation."
        )

    # -----------------------------------------------------
    # Build context
    # -----------------------------------------------------

    context = build_quiz_context(
        chunks
    )

    if not context.strip():

        raise ValueError(
            "Quiz context is empty."
        )

    logger.debug(
        "Quiz %s: built context from %d chunks.",
        quiz.id,
        len(chunks),
    )

    # -----------------------------------------------------
    # Generate questions with Claude
    # -----------------------------------------------------

    questions = generate_quiz_with_claude(
        context=context,
        question_count=question_count,
    )

    # -----------------------------------------------------
    # Save questions
    # -----------------------------------------------------

    saved_questions = save_quiz_questions(
        db=db,
        quiz=quiz,
        questions=questions,
    )

    logger.info(
        "Quiz %s generated successfully with %d questions.",
        quiz.id,
        len(saved_questions),
    )

    return saved_questions