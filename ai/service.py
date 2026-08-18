import re
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader
from sqlalchemy.orm import Session

from database import SessionLocal
from embedding_service import generate_embeddings
from models import Chunk, Document


CHUNK_SIZE = 700
CHUNK_OVERLAP = 100


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
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    # Replace single line breaks with spaces
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)

    # Collapse repeated spaces and tabs
    text = re.sub(r"[ \t]+", " ", text)

    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def split_text_into_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Split text into overlapping chunks.

    The function tries to end chunks at a sentence or space rather
    than cutting directly in the middle of a word.
    """
    if not text:
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")

    if overlap < 0:
        raise ValueError("overlap cannot be negative")

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        target_end = min(start + chunk_size, text_length)
        end = target_end

        if target_end < text_length:
            search_start = start + (chunk_size // 2)
            section = text[search_start:target_end]

            # Prefer ending after sentence punctuation
            sentence_positions = [
                section.rfind(". "),
                section.rfind("? "),
                section.rfind("! "),
                section.rfind("\n"),
            ]

            best_position = max(sentence_positions)

            if best_position != -1:
                end = search_start + best_position + 1
            else:
                # Otherwise, end at the last available space
                last_space = text.rfind(
                    " ",
                    search_start,
                    target_end,
                )

                if last_space != -1:
                    end = last_space

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        next_start = end - overlap

        # Protection against an infinite loop
        if next_start <= start:
            next_start = end

        start = next_start

    return chunks


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

    reader = PdfReader(str(path))
    extracted_chunks = []
    chunk_index = 0

    for page_number, page in enumerate(
        reader.pages,
        start=1,
    ):
        raw_text = page.extract_text() or ""
        cleaned_text = clean_text(raw_text)

        if not cleaned_text:
            continue

        page_chunks = split_text_into_chunks(
            cleaned_text,
            chunk_size=CHUNK_SIZE,
            overlap=CHUNK_OVERLAP,
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


def process_document(
    db: Session,
    document: Document,
) -> int:
    """
    Process one document and store its chunks and embeddings.

    Returns the number of stored chunks.
    """
    document.status = "processing"
    db.commit()

    try:
        extracted_chunks = extract_pdf_chunks(
            document.file_path
        )

        if not extracted_chunks:
            raise ValueError(
                "No readable text was found in the PDF"
            )

        chunk_texts = [
            item["content"]
            for item in extracted_chunks
        ]

        embeddings = generate_embeddings(chunk_texts)

        # Delete old chunks if the document is processed again
        (
            db.query(Chunk)
            .filter(Chunk.document_id == document.id)
            .delete(synchronize_session=False)
        )

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

        reader = PdfReader(document.file_path)
        document.page_count = len(reader.pages)
        document.status = "ready"

        db.commit()
        db.refresh(document)

        return len(extracted_chunks)

    except Exception:
        db.rollback()

        document = (
            db.query(Document)
            .filter(Document.id == document.id)
            .first()
        )

        if document:
            document.status = "failed"
            db.commit()

        raise


def process_document_background(
    document_id: UUID,
) -> None:
    """
    Background-task wrapper.

    It creates a new database session because the request session
    will be closed after the HTTP response is returned.
    """
    db = SessionLocal()

    try:
        document = (
            db.query(Document)
            .filter(Document.id == document_id)
            .first()
        )

        if not document:
            return

        process_document(db, document)

    finally:
        db.close()