import re
from dataclasses import dataclass
from uuid import UUID

from anthropic import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    RateLimitError,
)
from dotenv import load_dotenv
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Chunk, Document

from .anthropic_client import get_anthropic_client
#............for layer 1
from .input_gate import should_call_llm
#............
from .embedding_service import generate_embedding
from .reranker_service import rerank


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# RAG SETTINGS
# =========================================================

TOP_K = 5
MINIMUM_SIMILARITY = 0.30

# Reciprocal Rank Fusion constant used when combining the dense
# (embedding) ranking with the lexical (trigram) ranking for Arabic
# questions. A higher value makes the fused score less sensitive to
# small differences between nearby ranks; 60 is the commonly used
# default for RRF.
RRF_K = 60

# How many top RRF candidates to hand to the cross-encoder reranker
# for Arabic questions. The reranker is much more expensive per
# comparison than RRF, so it only ever looks at this shortlist,
# never the whole document.
RERANK_CANDIDATE_COUNT = 20


# =========================================================
# SYSTEM PROMPT
# =========================================================

SYSTEM_PROMPT = """
You are StudyMate, an AI study assistant for university students.

You must answer the student's question using only the document
context provided to you.

Rules:
1. Do not use outside knowledge.
2. Do not invent facts that are not present in the document context.
3. If the answer is not supported by the document context, clearly
   tell the student that this information could not be found in
   their document. Do not use a fixed English sentence for this —
   write it naturally in the same language as the student's
   question, following Rule 11.
4. Cite supporting pages using the format [Page X].
5. Give a clear, direct, and student-friendly answer.
6. If multiple chunks repeat the same information, do not repeat it.
7. You may use the conversation history to understand what the
   student is referring to, especially for follow-up questions.
8. Conversation history provides context only. The actual answer
   must still be based on the provided document context.
9. If the student asks something like "explain that more simply",
   "what does that mean?", or "give me an example", use the
   previous conversation to determine what "that" refers to.
10. Do not treat information from the conversation history as
    document evidence unless the same information is supported
    by the current document context.
11. Always answer in the same language the student used to ask
    their question. If the question is written in Arabic, the
    entire answer — including any "not found" message — must be
    written fully in Arabic. If the question is written in English,
    the entire answer must be fully in English. Never mix two
    languages within a single answer, and never default to English
    when the question was asked in Arabic.
12. Keep formatting simple and consistent across all answers.
    Do NOT use markdown headers (like ## or ###), emojis, or heavy
    bold formatting. Write in plain sentences and short paragraphs,
    the way a teacher would explain something directly to a
    student. You may use short bullet points ONLY when the
    question explicitly asks for a list or a comparison of
    multiple items (such as advantages vs. disadvantages) — and
    even then, keep bullets plain text without bold headers or
    emojis. When the question involves several distinct numbered
    parts or items (for example, multiple exercise numbers, or
    several functions to analyze), give each part its own line
    using the same numbering as the question, instead of merging
    all the sub-answers into one continuous paragraph — even if
    the question itself did not explicitly ask for "a list".
13. Some documents were extracted from PDFs and may contain
    mathematical notation, symbols, exponents, or formulas that
    were not extracted cleanly, so they may look unclear,
    inconsistent, or broken in the document context you receive.
    Never put quotation marks around a formula, equation, or
    phrase and present it as copied directly from the document
    unless it matches the document context character for
    character. If a formula or symbol in the document context
    looks unclear, inconsistent, or broken, your very first
    sentence must say so plainly, before you write any version of
    the formula. Do not open with a confident statement such as
    "the document states..." or "the document clearly states..."
    followed by a formula. After that first sentence, you may
    describe, in words, what the document context does make clear
    about the topic, but do not present more than one candidate
    version of the unclear formula, and do not cite a specific
    page number next to a formula or symbol you are not confident
    about.
""".strip()

# =========================================================
# RETRIEVED CHUNK
# =========================================================

@dataclass
class RetrievedChunk:
    id: UUID
    content: str
    page_number: int
    similarity: float


# =========================================================
# ARABIC QUESTION DETECTION
# =========================================================

ARABIC_CHARACTER_PATTERN = re.compile(r"[؀-ۿ]")
LATIN_CHARACTER_PATTERN = re.compile(r"[A-Za-z]")


def is_arabic_question(question: str) -> bool:
    """
    Decide whether the student's question is written mainly in
    Arabic, based on a simple character-range count.

    This is checked per-question, not per-document, so a document
    in one language can still be asked about in another, and the
    Arabic-specific retrieval improvements below only activate when
    they are actually needed.
    """
    arabic_count = len(ARABIC_CHARACTER_PATTERN.findall(question))
    latin_count = len(LATIN_CHARACTER_PATTERN.findall(question))
    return arabic_count > latin_count


# =========================================================
# RECIPROCAL RANK FUSION
# =========================================================

def compute_rrf_scores(
    chunk_ids,
    dense_rank_by_chunk_id: dict,
    similarity_rank_by_chunk_id: dict,
    word_similarity_rank_by_chunk_id: dict,
    rrf_k: int = RRF_K,
) -> dict:
    """
    Combine up to three separate rankings (dense/embedding rank,
    trigram similarity rank, trigram word_similarity rank) into one
    Reciprocal Rank Fusion score per chunk id.

    Each ranking dict maps chunk_id -> rank (1 = best). A chunk_id
    missing from a given ranking simply does not contribute a term
    for that ranking, so a chunk found by only one or two of the
    three search methods can still be scored.

    This is a pure function (no database or model calls), which
    keeps the RRF math itself directly unit-testable.
    """

    combined_score_by_chunk_id = {}

    for chunk_id in chunk_ids:

        score = 0.0

        dense_rank = dense_rank_by_chunk_id.get(chunk_id)
        if dense_rank is not None:
            score += 1.0 / (rrf_k + dense_rank)

        similarity_rank = similarity_rank_by_chunk_id.get(chunk_id)
        if similarity_rank is not None:
            score += 1.0 / (rrf_k + similarity_rank)

        word_similarity_rank = word_similarity_rank_by_chunk_id.get(chunk_id)
        if word_similarity_rank is not None:
            score += 1.0 / (rrf_k + word_similarity_rank)

        combined_score_by_chunk_id[chunk_id] = score

    return combined_score_by_chunk_id


# =========================================================
# RETRIEVE RELEVANT CHUNKS
# =========================================================
def retrieve_relevant_chunks(
    db: Session,
    document_id: UUID,
    question: str,
    top_k: int = TOP_K,
) -> list[RetrievedChunk]:
    """
    Retrieve the chunks most relevant to the student's question.

    For non-Arabic questions, this is a pure dense (embedding)
    similarity search, exactly as before.

    For Arabic questions, dense search alone under-performs because
    the embedding model (all-MiniLM-L6-v2) was not trained
    specifically for Arabic, and we are not changing that model.
    To compensate, Arabic questions also run a lexical
    (character-trigram) search against the chunk text using
    PostgreSQL's pg_trgm extension, and the dense ranking and the
    two trigram rankings are combined using Reciprocal Rank Fusion
    (RRF). The top RERANK_CANDIDATE_COUNT chunks from that combined
    ranking are then rescored by a multilingual cross-encoder
    reranking model, which is more accurate than RRF but too slow
    to run on the whole document, and the final top_k chunks are
    picked from the reranked results.
    """

    if not question or not question.strip():
        raise ValueError(
            "Question cannot be empty"
        )

    # -----------------------------------------------------
    # Generate embedding for the question
    # -----------------------------------------------------

    query_embedding = generate_embedding(
        question
    )

    # -----------------------------------------------------
    # Calculate cosine distance
    # -----------------------------------------------------

    distance = Chunk.embedding.cosine_distance(
        query_embedding
    ).label("distance")

    dense_query = (
        db.query(Chunk, distance)
        .filter(
            Chunk.document_id == document_id,
            Chunk.embedding.isnot(None)
        )
        .order_by(distance)
    )

    # -----------------------------------------------------
    # Non-Arabic question: unchanged pure dense search
    # -----------------------------------------------------

    if not is_arabic_question(question):

        results = dense_query.limit(top_k).all()

        return [
            RetrievedChunk(
                id=chunk.id,
                content=chunk.content,
                page_number=chunk.page_number,
                similarity=1.0 - float(cosine_distance),
            )
            for chunk, cosine_distance in results
        ]

    # -----------------------------------------------------
    # Arabic question: hybrid dense + lexical (trigram)
    # search, combined with Reciprocal Rank Fusion
    # -----------------------------------------------------

    dense_results = dense_query.all()

    dense_similarity_by_chunk_id: dict = {}
    dense_rank_by_chunk_id: dict = {}
    chunk_by_id: dict = {}

    for rank, (chunk, cosine_distance) in enumerate(dense_results, start=1):
        dense_similarity_by_chunk_id[chunk.id] = 1.0 - float(cosine_distance)
        dense_rank_by_chunk_id[chunk.id] = rank
        chunk_by_id[chunk.id] = chunk

    trigram_results = (
        db.query(
            Chunk,
            func.similarity(Chunk.content, question).label(
                "trigram_similarity"
            ),
            func.word_similarity(question, Chunk.content).label(
                "trigram_word_similarity"
            ),
        )
        .filter(Chunk.document_id == document_id)
        .all()
    )

    for chunk, _similarity, _word_similarity in trigram_results:
        chunk_by_id.setdefault(chunk.id, chunk)

    similarity_ranking = sorted(
        trigram_results,
        key=lambda row: row[1],
        reverse=True,
    )
    word_similarity_ranking = sorted(
        trigram_results,
        key=lambda row: row[2],
        reverse=True,
    )

    similarity_rank_by_chunk_id = {
        chunk.id: rank
        for rank, (chunk, _similarity, _word_similarity)
        in enumerate(similarity_ranking, start=1)
    }
    word_similarity_rank_by_chunk_id = {
        chunk.id: rank
        for rank, (chunk, _similarity, _word_similarity)
        in enumerate(word_similarity_ranking, start=1)
    }

    # -----------------------------------------------------
    # Combine all rankings with Reciprocal Rank Fusion
    # -----------------------------------------------------

    # -----------------------------------------------------
    # Combine all rankings with Reciprocal Rank Fusion
    # -----------------------------------------------------

    combined_score_by_chunk_id = compute_rrf_scores(
        chunk_by_id.keys(),
        dense_rank_by_chunk_id,
        similarity_rank_by_chunk_id,
        word_similarity_rank_by_chunk_id,
    )

    candidate_chunk_ids = sorted(
        combined_score_by_chunk_id,
        key=lambda chunk_id: combined_score_by_chunk_id[chunk_id],
        reverse=True,
    )[:RERANK_CANDIDATE_COUNT]

    # -----------------------------------------------------
    # Rerank the shortlist with the cross-encoder model
    # -----------------------------------------------------

    candidate_chunks = [
        chunk_by_id[chunk_id]
        for chunk_id in candidate_chunk_ids
    ]

    rerank_scores = rerank(
        question,
        [chunk.content for chunk in candidate_chunks],
    )

    reranked_candidates = sorted(
        zip(candidate_chunk_ids, candidate_chunks, rerank_scores),
        key=lambda item: item[2],
        reverse=True,
    )[:top_k]

    retrieved_chunks = []

    for chunk_id, chunk, _rerank_score in reranked_candidates:

        retrieved_chunks.append(
            RetrievedChunk(
                id=chunk.id,
                content=chunk.content,
                page_number=chunk.page_number,
                # Reported similarity stays the dense/embedding
                # similarity (0.0 if the chunk had no embedding),
                # so the MINIMUM_SIMILARITY relevance filter further
                # down the pipeline keeps working the same way it
                # always has.
                similarity=dense_similarity_by_chunk_id.get(
                    chunk_id, 0.0
                ),
            )
        )

    return retrieved_chunks


# =========================================================
# BUILD CONTEXT
# =========================================================

def build_context(
    chunks: list[RetrievedChunk],
) -> str:
    """
    Format retrieved chunks and their page numbers
    before sending them to Claude.
    """

    context_sections = []

    for number, chunk in enumerate(
        chunks,
        start=1,
    ):
        section = (
            f"Source {number} - Page "
            f"{chunk.page_number}\n"
            f"{chunk.content}"
        )

        context_sections.append(
            section
        )

    return "\n\n---\n\n".join(
        context_sections
    )


# =========================================================
# GENERATE ANSWER WITH CLAUDE
# =========================================================

def generate_answer_with_claude(
    question: str,
    chunks: list[RetrievedChunk],
    conversation_history: list[dict] | None = None,
) -> str:
    """
    Ask Claude to answer the student's question
    using the retrieved document context and
    previous conversation history.

    conversation_history contains previous messages
    in Anthropic's message format:

    [
        {
            "role": "user",
            "content": "Previous question"
        },
        {
            "role": "assistant",
            "content": "Previous answer"
        }
    ]

    The current question is added separately as the
    newest user message.
    """

    if not chunks:
        return (
            "I could not find this information "
            "in your document."
        )

    # -----------------------------------------------------
    # Normalize conversation history
    # -----------------------------------------------------

    if conversation_history is None:
        conversation_history = []

    # -----------------------------------------------------
    # Build document context
    # -----------------------------------------------------

    context = build_context(
        chunks
    )

    # -----------------------------------------------------
    # Build current user prompt
    # -----------------------------------------------------

    user_prompt = f"""
DOCUMENT CONTEXT:

{context}

CURRENT STUDENT QUESTION:

{question}

Answer the current question using only the document context.

Use the conversation history only to understand references
and follow-up questions.

If the question refers to something from the previous
conversation, identify what the student means and answer
based on the document context.

Include page citations such as [Page 3].
""".strip()

    # -----------------------------------------------------
    # Create Anthropic client
    # -----------------------------------------------------

    client = get_anthropic_client()

    # -----------------------------------------------------
    # Get Claude model from .env
    # -----------------------------------------------------

    import os

    claude_model = os.getenv(
        "CLAUDE_MODEL"
    )

    if not claude_model:
        raise RuntimeError(
            "CLAUDE_MODEL is missing from the .env file"
        )

    # -----------------------------------------------------
    # Build Claude messages
    # -----------------------------------------------------
    #
    # Previous conversation messages are added first.
    #
    # Then the current question is added last.
    #
    # Example:
    #
    # User:
    # What is supply and demand?
    #
    # Assistant:
    # Supply and demand describe...
    #
    # User:
    # Explain that more simply.
    #
    # Claude can now understand what "that" means.
    # -----------------------------------------------------

    messages = []

    for message in conversation_history:

        role = message.get("role")
        content = message.get("content")

        if role not in {"user", "assistant"}:
            continue

        if not content:
            continue

        messages.append(
            {
                "role": role,
                "content": str(content),
            }
        )

    # -----------------------------------------------------
    # Add current question
    # -----------------------------------------------------

    messages.append(
        {
            "role": "user",
            "content": user_prompt,
        }
    )

    # -----------------------------------------------------
    # Call Claude
    # -----------------------------------------------------

    try:

        response = client.messages.create(
            model=claude_model,
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

    except RateLimitError as error:

        raise RuntimeError(
            "The AI service rate limit was reached. "
            "Please try again later."
        ) from error

    except APITimeoutError as error:

        raise RuntimeError(
            "The AI service took too long to respond."
        ) from error

    except APIConnectionError as error:

        raise RuntimeError(
            "Could not connect to the AI service."
        ) from error

    except APIStatusError as error:

        raise RuntimeError(
            f"The AI service returned an error: {error}"
        ) from error

    # -----------------------------------------------------
    # Extract text from Claude response
    # -----------------------------------------------------

    answer_parts = [
        block.text
        for block in response.content
        if block.type == "text"
    ]

    answer = "\n".join(
        answer_parts
    ).strip()

    if not answer:
        raise RuntimeError(
            "The AI service returned an empty answer"
        )

    return answer


# =========================================================
# COMPLETE RAG PIPELINE
# =========================================================

def answer_question(
    db: Session,
    document_id: UUID,
    question: str,
    conversation_history: list[dict] | None = None,
) -> dict:
    """
    Complete RAG pipeline:

    1. Check document readiness
    2. Generate question embedding
    3. Retrieve relevant chunks
    4. Calculate similarity
    5. Filter irrelevant chunks
    6. Load conversation history
    7. Send conversation history + document context
       + current question to Claude
    8. Return answer and sources

    conversation_history:
        Previous messages from the current conversation.
        It is used to give Claude conversational memory,
        especially for follow-up questions.
    """

    # -----------------------------------------------------
    # Find document
    # -----------------------------------------------------

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id
        )
        .first()
    )

    if not document:
        raise ValueError(
            "Document not found"
        )

    # -----------------------------------------------------
    # Make sure document is processed
    # -----------------------------------------------------

    if document.status != "ready":

        raise ValueError(
            f"Document is not ready. "
            f"Current status: {document.status}"
        )

    # -----------------------------------------------------
    # Validate question
    # -----------------------------------------------------

    if not question or not question.strip():

        raise ValueError(
            "Question cannot be empty"
        )

    # -----------------------------------------------------
    # Check for trivial small talk (input gate)
    # -----------------------------------------------------

    proceed, canned_reply = should_call_llm(question)

    if not proceed:
        return {
            "answer": canned_reply,
            "sources": [],
        }

    # -----------------------------------------------------
    # Retrieve relevant chunks
    # -----------------------------------------------------

    chunks = retrieve_relevant_chunks(
        db=db,
        document_id=document_id,
        question=question,
    )

    relevant_chunks = [
        chunk
        for chunk in chunks
        if chunk.similarity
        >= MINIMUM_SIMILARITY
    ]

    # -----------------------------------------------------
    # Retry retrieval using recent conversation context
    # -----------------------------------------------------
    #
    # A short follow-up question (e.g. "explain the first
    # point in more detail") often has no meaningful content
    # on its own, so the raw-question search above may find
    # nothing. If we have conversation history, retry the
    # search using the last user question and last assistant
    # answer combined with the current question, so the
    # search has enough context to find the right chunks.

    if not relevant_chunks and conversation_history:

        last_user_message = None
        last_assistant_message = None

        for message in reversed(conversation_history):
            role = message.get("role")
            content = message.get("content")

            if not content:
                continue

            if role == "assistant" and last_assistant_message is None:
                last_assistant_message = str(content)

            if role == "user" and last_user_message is None:
                last_user_message = str(content)

            if last_user_message and last_assistant_message:
                break

        context_parts = [
            text
            for text in (last_user_message, last_assistant_message)
            if text
        ]

        if context_parts:

            combined_question = "\n".join(
                context_parts + [question]
            )

            chunks = retrieve_relevant_chunks(
                db=db,
                document_id=document_id,
                question=combined_question,
            )

            relevant_chunks = [
                chunk
                for chunk in chunks
                if chunk.similarity
                >= MINIMUM_SIMILARITY
            ]

    # -----------------------------------------------------
    # No relevant information found
    # -----------------------------------------------------

    if not relevant_chunks:

        return {
            "answer": (
                "I could not find this information "
                "in your document."
            ),
            "sources": [],
        }

    # -----------------------------------------------------
    # Generate answer with Claude
    # -----------------------------------------------------

    answer = generate_answer_with_claude(
        question=question,
        chunks=relevant_chunks,
        conversation_history=conversation_history,
    )

    # -----------------------------------------------------
    # Build sources
    # -----------------------------------------------------

    sources = [
        {
            "chunk_id": str(chunk.id),
            "page_number": chunk.page_number,
            "content": chunk.content,
            "similarity": round(
                chunk.similarity,
                4,
            ),
        }
        for chunk in relevant_chunks
    ]

    # -----------------------------------------------------
    # Return final RAG response
    # -----------------------------------------------------

    return {
        "answer": answer,
        "sources": sources,
    }