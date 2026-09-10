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

#from pypdf import PdfReader
import io
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from spellchecker import SpellChecker

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

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

    # Remove Arabic tatweel (kashida) characters.
    #
    # This character is purely a visual justification mark used to
    # stretch words when Arabic text is fully justified on a page.
    # It carries no phonetic or semantic meaning on its own. Some
    # PDF extraction results insert it as a literal character in
    # the middle of words (for example "نَـتَــأمَّـل" instead of
    # the correct "نَتَأَمَّل"), which breaks word-level matching
    # for both semantic search and any text-based search. Removing
    # it cannot corrupt a correct word, so this is always safe.
    text = text.replace("ـ", "")

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
# =========================================================
# EXTRACTION SETTINGS
# =========================================================

# If OCR finds meaningfully MORE text than normal extraction
# for the same page, trust OCR instead. This adapts per page
# instead of relying on one fixed character-count threshold.
OCR_IMPROVEMENT_RATIO = 1.3

OCR_RENDER_DPI = 300


# =========================================================
# EXTRACT TEXT IN VISUAL READING ORDER
# =========================================================

def extract_text_in_reading_order(page) -> str:
    """
    Extract text from a PDF page while respecting its
    visual layout (top-to-bottom, then left-to-right),
    instead of the PDF's raw internal content order.
    """

    blocks = page.get_text("blocks")

    blocks.sort(
        key=lambda block: (
            round(block[1], 1),
            round(block[0], 1),
        )
    )

    text_parts = [
        block[4]
        for block in blocks
        if block[4].strip()
    ]

    return "\n\n".join(text_parts)

#ORC........................................
# =========================================================
# DETECT OCR LANGUAGE
# =========================================================
#
# Tesseract needs to know which language model to use. Different
# documents in StudyMate can be in different languages (Arabic or
# English so far), so instead of hardcoding one language for every
# page, we look at the text already extracted directly from the
# page and pick the language with more matching characters. If the
# page looks Arabic, we use the Arabic model; otherwise we fall
# back to "eng", which is Tesseract's own default and matches the
# behavior this project already had for English documents.

ARABIC_CHARACTER_PATTERN = re.compile(r"[؀-ۿ]")
LATIN_CHARACTER_PATTERN = re.compile(r"[A-Za-z]")


def detect_ocr_language(text: str) -> str:
    """
    Decide which Tesseract language model to use for OCR on this
    page, based on the script of the text already extracted
    directly from it.
    """

    arabic_count = len(
        ARABIC_CHARACTER_PATTERN.findall(text)
    )

    latin_count = len(
        LATIN_CHARACTER_PATTERN.findall(text)
    )

    if arabic_count > latin_count:
        return "ara"

    return "eng"


# =========================================================
# OCR EXTRACTION
# =========================================================

def extract_text_with_ocr(page, lang: str = "eng") -> str:
    """
    Render the page as an image and run OCR on it, using the
    given Tesseract language model.
    """

    pixmap = page.get_pixmap(dpi=OCR_RENDER_DPI)

    image = Image.open(
        io.BytesIO(pixmap.tobytes("png"))
    )

    return pytesseract.image_to_string(image, lang=lang)


# =========================================================
# WORD-LEVEL TEXT QUALITY CHECK
# =========================================================
#
# Character-count comparison alone cannot detect a broken
# font encoding: a garbled page can have roughly the same
# number of characters as a correctly extracted one, just
# with wrong letters. This measures how many of a text's
# alphabetic words are recognizable English words, so two
# extraction results for the same page can be compared
# against each other directly, instead of judged against a
# single fixed threshold.

_spell_checker = SpellChecker()

MIN_WORDS_FOR_QUALITY_CHECK = 20


def unknown_word_ratio(text: str) -> float | None:
    """
    Return the fraction of alphabetic words in the given text
    that are not recognizable English words, or None if there
    are too few words to judge reliably.
    """

    words = re.findall(r"[A-Za-z]+", text)

    if len(words) < MIN_WORDS_FOR_QUALITY_CHECK:
        return None

    lowercase_words = [word.lower() for word in words]

    unknown_words = _spell_checker.unknown(lowercase_words)

    return len(unknown_words) / len(lowercase_words)


# =========================================================
# LANGUAGE-AGNOSTIC TEXT QUALITY CHECK
# =========================================================
#
# unknown_word_ratio() above can only judge English text, since it
# relies on an English dictionary. For any other language (Arabic
# so far), it always returns None, so extract_page_text() never
# actually compares extraction quality for those pages and just
# keeps whatever normal extraction produced, however corrupted.
#
# This check does not depend on any language or dictionary. It
# measures the fraction of characters that fall outside the set
# normally expected in Arabic or English text (letters, digits,
# and common punctuation). A broken font encoding tends to turn
# specific letters into characters from unrelated Unicode blocks
# (stray Cyrillic- or Armenian-looking characters, for example),
# which shows up here as a higher ratio, regardless of language.

EXPECTED_CHARACTER_PATTERN = re.compile(
    r"[؀-ۿ"
    r"\ufb50-\ufdff\ufe70-\ufeff"
    r"\u200e\u200f"
    r"A-Za-z0-9"
    r".,;:!?()\[\]{}\"'\-/\\@#%&*+=<>_~`|^$ ﻿]"
)

MIN_CHARACTERS_FOR_SUSPICIOUS_CHECK = 40

# OCR itself is not perfectly accurate, especially on heavily
# vocalized Arabic text, so it can introduce its own word-level
# reading errors that this character-range check cannot see (a
# misread letter is still a normal Arabic letter). Switching to
# OCR is only worth that risk when normal extraction is actually
# corrupted by a meaningful amount, not just a fraction of a
# percent lower than OCR's own ratio. 0.015 was chosen from real
# measurements: a barely-affected page scored well under this
# (0.0068), while a genuinely corrupted page scored well over it
# (0.0323).
MEANINGFUL_CORRUPTION_THRESHOLD = 0.015


def suspicious_character_ratio(text: str) -> float | None:
    """
    Return the fraction of non-space characters in the given text
    that fall outside the set of characters normally expected in
    Arabic or English text, or None if there is too little text to
    judge reliably.
    """

    non_space_characters = [
        character
        for character in text
        if not character.isspace()
    ]

    if len(non_space_characters) < MIN_CHARACTERS_FOR_SUSPICIOUS_CHECK:
        return None

    suspicious_characters = [
        character
        for character in non_space_characters
        if not EXPECTED_CHARACTER_PATTERN.match(character)
    ]

    return len(suspicious_characters) / len(non_space_characters)

# =========================================================
# BROKEN FONT ENCODING (extract mod1)
# =========================================================
#
# Some Arabic PDFs embed a font whose character map is wrong: the
# shape drawn on the page is correct, but the code point the
# extractor reads belongs to a different script. In the
# seventh-grade Arabic textbook three separate characters all
# stand for alef, one per font used in the book:
#
#     السّȌبِعَة -> السّابِعَة       الҙأسْئِلَة -> الأسْئِلَة
#
# Measured over that document: 1777 substituted characters on 118
# of its 120 pages, touching 9.6% of its Arabic words. Each of the
# three appears in varied company - before a hamza, before
# ل ت ب ن س, and at the end of a word - which is what identifies
# it as a letter rather than an artifact of a ligature.
SUBSTITUTED_CHARACTERS = {
    "\u020c": "ا",   # Ȍ  LATIN CAPITAL LETTER O WITH DOUBLE GRAVE
    "\u0499": "ا",   # ҙ  CYRILLIC SMALL LETTER ZE WITH DESCENDER
    "\u053d": "ا",   # Խ  ARMENIAN CAPITAL LETTER XEH
}

# Symbol-font glyphs - a tick, a cross, a phone icon - land in the
# private use area and carry no text at all.
PRIVATE_USE_PATTERN = re.compile(r"[\ue000-\uf8ff]")

# The same extractor writes hamza-alef as two characters: a bare
# alef followed by the letter itself. Undone AFTER the substitution
# above, so الҙأسْئِلَة becomes الاأسْئِلَة becomes الأسْئِلَة.
DOUBLED_HAMZA = {
    "اأ": "أ",
    "اإ": "إ",
    "اآ": "آ",
}


def repair_broken_encoding(text: str) -> str:
    """
    Undo the character substitution a broken font encoding causes.

    Applied word by word, and only to words that already contain
    Arabic, so a document that legitimately uses one of these
    characters - an Armenian or a Croatian text - is left alone.
    """

    if not text:
        return ""

    def repair_word(word: str) -> str:

        if not ARABIC_CHARACTER_PATTERN.search(word):
            return word

        for wrong, right in SUBSTITUTED_CHARACTERS.items():
            word = word.replace(wrong, right)

        word = PRIVATE_USE_PATTERN.sub("", word)

        for wrong, right in DOUBLED_HAMZA.items():
            word = word.replace(wrong, right)

        return word

    return "".join(
        piece if piece.isspace() else repair_word(piece)
        for piece in re.split(r"(\s+)", text)
    )
# =========================================================
# ARABIC WORD-LENGTH QUALITY CHECK(extract mod3)
# =========================================================
#
# When OCR fails on an Arabic page it does not return LESS text, it
# returns more: it breaks words into single letters and reads
# decorative borders as long strings of punctuation. Both the
# length rule and the suspicious-character rule below therefore
# read a failed OCR result as an improvement, and on this textbook
# they stored it over perfectly readable text on ten pages.
#
# Average Arabic word length separates the two, but only as a
# comparison between the two candidates for the SAME page, never as
# a fixed threshold. Measured over those ten pages, normal
# extraction averaged 2.67 to 5.50 and OCR 0.00 to 3.63 - the two
# ranges overlap, so no single cut-off can split them. The gap
# between the two candidates on one page, however, was never
# smaller than 0.82, which is why the margin below sits at 0.5.

MIN_ARABIC_WORDS_FOR_QUALITY = 8#تعديل من 15 

ARABIC_QUALITY_MARGIN = 0.5

ARABIC_WORD_PATTERN = re.compile(r"[\u0600-\u06ff]+")

# Diacritics and tatweel are not letters and would distort the
# average, so they are removed before measuring.
ARABIC_DIACRITIC_PATTERN = re.compile(r"[\u064b-\u0652\u0670\u0640]")


def average_arabic_word_length(text: str) -> float | None:
    """
    Return the mean length of the Arabic words in the text, or None
    if there are too few of them to judge reliably.
    """

    words = ARABIC_WORD_PATTERN.findall(
        ARABIC_DIACRITIC_PATTERN.sub("", text)
    )

    if len(words) < MIN_ARABIC_WORDS_FOR_QUALITY:
        return None

    return sum(len(word) for word in words) / len(words)


def ocr_lost_the_arabic(extracted_text: str, ocr_text: str) -> bool:
    """
    Decide whether OCR read an Arabic page worse than normal
    extraction did, so its result can be refused however much more
    text it appears to contain.
    """

    if not ARABIC_CHARACTER_PATTERN.search(extracted_text):
        # Not an Arabic page, or a scanned one where normal
        # extraction found nothing at all. Either way this check
        # does not apply and OCR is judged by the rules below.
        return False

    if not ARABIC_CHARACTER_PATTERN.search(ocr_text):
        # OCR read an Arabic page as pictures and Latin noise -
        # pages 7 and 9 of the textbook, where it returned
        # "Vi ENVY) ENVY NY" for a decorated title page.
        return True

    extracted_quality = average_arabic_word_length(extracted_text)
    ocr_quality = average_arabic_word_length(ocr_text)

    if extracted_quality is None or ocr_quality is None:
        return False

    return ocr_quality < extracted_quality - ARABIC_QUALITY_MARGIN
#--------------mod end
# =========================================================
# EXTRACT BEST AVAILABLE TEXT FOR A PAGE
# =========================================================

def extract_page_text(page) -> str:
    """
    Extract the most complete and reliable text available
    for a page.

    Runs both normal extraction and OCR. If OCR captured
    meaningfully more content (for example, a scanned page),
    it is used. Otherwise, whichever of the two results has
    fewer unrecognizable words is used, since a broken font
    encoding can corrupt specific words without reducing the
    character count enough for the length-based check alone
    to catch it.
    """
#(extract mod2)
    # Repair what can be repaired BEFORE the two candidates are
    # compared, so the quality checks below judge damage that is
    # still there rather than damage already undone. Applied to
    # both candidates so the comparison stays symmetric.

    extracted_text = repair_broken_encoding(
        extract_text_in_reading_order(page)
    )

    ocr_language = detect_ocr_language(extracted_text)

    ocr_text = repair_broken_encoding(
        extract_text_with_ocr(page, lang=ocr_language)
    )
#----------mod end
#(extract mod4)
    if ocr_lost_the_arabic(extracted_text, ocr_text):

        logger.info(
            "Page: OCR read the Arabic worse than normal extraction. "
            "Keeping normal extraction."
        )

        return extracted_text
    #-----------mod end
    extracted_length = len(extracted_text.strip())
    ocr_length = len(ocr_text.strip())

    if ocr_length > extracted_length * OCR_IMPROVEMENT_RATIO:

        logger.info(
            "Page: OCR found more content than normal "
            "extraction (%d vs %d chars). Using OCR result.",
            ocr_length,
            extracted_length,
        )

        return ocr_text

    extracted_ratio = unknown_word_ratio(extracted_text)
    ocr_ratio = unknown_word_ratio(ocr_text)

    if (
        extracted_ratio is not None
        and ocr_ratio is not None
        and ocr_ratio < extracted_ratio
    ):

        logger.info(
            "Page: OCR text has fewer unrecognizable words "
            "(%.3f vs %.3f) than normal extraction. "
            "Using OCR result.",
            ocr_ratio,
            extracted_ratio,
        )

        return ocr_text

    extracted_suspicious_ratio = suspicious_character_ratio(extracted_text)
    ocr_suspicious_ratio = suspicious_character_ratio(ocr_text)

    if (
        extracted_suspicious_ratio is not None
        and ocr_suspicious_ratio is not None
        and extracted_suspicious_ratio > MEANINGFUL_CORRUPTION_THRESHOLD
        and ocr_suspicious_ratio < extracted_suspicious_ratio
    ):

        logger.info(
            "Page: normal extraction is meaningfully corrupted "
            "and OCR text has fewer unexpected characters "
            "(%.3f vs %.3f). Using OCR result.",
            ocr_suspicious_ratio,
            extracted_suspicious_ratio,
        )

        return ocr_text

    return extracted_text
#ORC........................................
#ORC........................................

# =========================================================
# EXTRACT PDF CHUNKS
# =========================================================

def extract_pdf_chunks(
    file_path: str,
) -> list[dict]:
    """
    Extract and chunk a PDF page by page.

    Uses PyMuPDF with visual reading order, and falls back
    to OCR (per page) whenever it captures more content than
    normal extraction.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"PDF file was not found: {file_path}"
        )

    pdf_document = fitz.open(str(path))

    extracted_chunks = []

    chunk_index = 0

    for page_index in range(len(pdf_document)):

        page = pdf_document[page_index]

        page_number = page_index + 1

        raw_text = extract_page_text(page)

        cleaned_text = clean_text(raw_text)

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

    pdf_document.close()

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

        pdf_document = fitz.open(
            document.file_path
        )

        document.page_count = len(
            pdf_document
        )

        pdf_document.close()

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