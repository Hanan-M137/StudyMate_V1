import logging
import os
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
# LOGGING
# =========================================================

logger = logging.getLogger(__name__)


# =========================================================
# RAG SETTINGS
# =========================================================

TOP_K = 5


# Minimum cross-encoder reranker score for a chunk to be treated as
# relevant, and therefore also the point at which the document is
# judged to have no answer and the general-knowledge path runs.
#
# The reranker reads the question and the chunk together, so its score
# reflects actual relevance far better than the dense cosine
# similarity, which was measured to be misleading in both directions:
# it discarded a correct chunk scoring 0.2867 and kept unrelated
# chunks scoring above 0.60.
#
# The cut-off itself is measured, not reasoned. 0.0 looked like the
# natural boundary because a positive score "means relevant", but the
# scores do not behave that way. Measured over every chunk of both
# documents, against questions whose answer page is known and
# questions the document cannot answer at all, by the best score each
# question reached:
#
#                        has an answer      has none
#     Arabic             +0.59 .. +5.24     -2.74 .. -0.08
#     English            +1.39 .. +7.42     -6.04 .. -3.51
#
# One value separates both languages, so this does not need to be per
# language. 0.25 sits above the Arabic hard case with margin and well
# below the lowest real Arabic answer, which is the tighter side. That
# margin earned itself immediately: "5+5?" asked of the Arabic
# textbook scored +0.09 - higher than anything in the sample above,
# and still refused.
#
# Do not change this without re-running that measurement. A threshold
# calibrated on one language's score distribution and applied to
# another is how this value was wrong before.
MINIMUM_RERANK_SCORE = 0.25

# Reciprocal Rank Fusion constant used when combining the dense
# (embedding) ranking with the two lexical (trigram) rankings. A
# higher value makes the fused score less sensitive to small
# differences between nearby ranks; 60 is the commonly used
# default for RRF.
RRF_K = 60

# How many top RRF candidates to hand to the cross-encoder reranker.
# The reranker is much more expensive per
# comparison than RRF, so it only ever looks at this shortlist,
# never the whole document.
RERANK_CANDIDATE_COUNT = 20


# =========================================================
# QUERY REWRITE SETTINGS
# =========================================================

# A rewritten question should be a tidied-up version of what the
# student asked, not a new paragraph. If the model ignores its
# instructions and returns an explanation instead of a question,
# the result is discarded and the original question is used. The
# floor exists because the ratio alone is unusable for very short
# questions: "5+5" is three characters, and four times that would
# reject any sane rewrite.
#
# The floor was raised from 200 after measuring how much the
# rewrite length varies for identical input. The same nine
# character follow-up, with an unchanged prompt, produced
# rewrites of 255, 98 and 44 characters across three consecutive
# runs in the same conversation. A floor of 200 discarded the
# longest of them, sending a legitimate follow-up down the
# general-knowledge path with no citations. The length of a
# correct rewrite is not predictable enough to sit a tight limit
# against, so the floor covers the upper end of that spread
# rather than its middle. A runaway answer, the case this guard
# actually exists for, runs to well over a thousand characters
# and is still caught comfortably.
REWRITE_MAX_LENGTH_RATIO = 4
REWRITE_MAX_LENGTH_FLOOR = 300

# =========================================================
# CLAUDE MODEL SELECTION
# =========================================================

def get_fast_claude_model() -> str:
    """
    Return the model id to use for cheap, mechanical calls such as
    rewriting a follow-up question into a standalone one.

    These calls are internal plumbing; the student never reads
    their output directly, so they do not need the main model.
    CLAUDE_FAST_MODEL is used when it is configured, and
    CLAUDE_MODEL is the fallback when it is not, so the feature
    still works on a deployment that has never heard of it.
    """

    fast_model = os.getenv("CLAUDE_FAST_MODEL")

    if fast_model:
        return fast_model

    claude_model = os.getenv("CLAUDE_MODEL")

    if claude_model:
        return claude_model

    raise RuntimeError(
        "Neither CLAUDE_FAST_MODEL nor CLAUDE_MODEL is set "
        "in the .env file"
    )


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
# QUERY REWRITE SYSTEM PROMPT
# =========================================================
#
# Used only for the internal rewrite step. The student never sees
# this output; it is fed straight back into retrieval as a search
# query, which is why the prompt is so insistent about returning
# nothing but the question itself.

REWRITE_SYSTEM_PROMPT = """
You rewrite a student's latest message into a single, standalone
question that can be understood on its own, without the
conversation around it.

Use the conversation history to work out what the message refers
to. If the student writes "explain that more simply", find what
"that" points at in the previous messages and name it explicitly
in the rewritten question.

Rules:
1. Output ONLY the rewritten question. No preamble, no
   explanation, no commentary, no quotation marks around it.
2. If the message is already self-contained, return it completely
   unchanged.
3. Keep the rewritten question in the same language the student
   used.
4. Keep it short. It is a question, not a summary.
5. Never answer the question. Only rewrite it.
6. Never ask the student anything. Your output is a search query
   for a document, not a message to a person. If the message
   could refer to more than one thing in the conversation, name
   all of the likely topics in the rewritten question instead of
   asking which one is meant.
""".strip()


# =========================================================
# GENERAL KNOWLEDGE SYSTEM PROMPT
# =========================================================
#
# The main SYSTEM_PROMPT above forbids outside knowledge, which is
# the opposite of what is needed once retrieval has found nothing.
# This prompt is used only on that path.

GENERAL_KNOWLEDGE_SYSTEM_PROMPT = """
You are StudyMate, an AI study assistant for university students.

The student asked a question and it was NOT found anywhere in the
document they uploaded. You are answering without any document
context. Decide which of the three cases below applies, and answer
accordingly.

CASE 1 - A legitimate educational or academic question.
For example arithmetic, a definition, an explanation of a concept,
or a short translation of study material. Answer it properly and
helpfully. Begin by making clear, in one short sentence, that this
answer comes from general knowledge and not from the student's
document, then give the answer.

CASE 2 - A question about you, or a vague request for help.
For example "can you help me", "what can you do", "who are you".
Briefly say what StudyMate does: it answers questions about the
documents a student uploads, explains concepts from them, and
creates quizzes from them. Then invite the student to ask
something about their document. Keep it to a few sentences.

CASE 3 - Anything outside studying.
For example weather, sport, news, entertainment, shopping,
personal or medical advice, or anything that needs live or
real-time data you do not have. Politely decline in one or two
sentences and point the student back to their document. Do not
guess and do not pretend to have current information.

THE BOUNDARY BETWEEN HELPING AND SUBSTITUTING:
Answer questions that teach the student something. Decline to
produce work that replaces the student's own effort. Do not write
a full essay for them, and do not produce a finished set of
homework or exam answers. When you are asked for that, say plainly
that you will not do the work for them, and offer the alternative:
explain the topic, walk through the method, work one example, or
check reasoning the student has already written. Explaining how to
solve a problem is help. Handing over the completed answers is not.

FORMATTING AND LANGUAGE:
Keep formatting simple and consistent. Do NOT use markdown headers
(like ## or ###), emojis, or heavy bold formatting. Write in plain
sentences and short paragraphs, the way a teacher would explain
something directly to a student. You may use short bullet points
ONLY when the question explicitly asks for a list or a comparison
of multiple items, and even then keep them plain text.

Always answer in the same language the student used to ask their
question. If the question is written in Arabic, the entire answer
must be written fully in Arabic. If the question is written in
English, the entire answer must be fully in English. Never mix two
languages within a single answer, and never default to English
when the question was asked in Arabic.
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
    rerank_score: float | None = None


# =========================================================
# ARABIC QUESTION DETECTION
# =========================================================

ARABIC_CHARACTER_PATTERN = re.compile(r"[؀-ۿ]")
LATIN_CHARACTER_PATTERN = re.compile(r"[A-Za-z]")


def is_arabic_question(question: str) -> bool:
    """
    Decide whether the student's question is written mainly in
    Arabic, based on a simple character-range count.

    Not currently called by the retrieval path: every question now
    goes through the same hybrid search regardless of language.
    Kept for the upcoming cross-language handling, which needs to
    compare the question's language against the document's.
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

    Every question, in any language, goes through the same hybrid
    retrieval path. Dense (embedding) search alone is not enough:
    the retrieval model is multilingual-e5-small, which reads Arabic
    properly, but it places nearly every score between 0.77 and
    0.88, so its ranking carries little margin. To compensate, every
    question also runs a lexical (character-trigram) search against
    the chunk text using PostgreSQL's pg_trgm extension, and the
    dense ranking and the two trigram rankings are combined using
    Reciprocal Rank Fusion (RRF). The top RERANK_CANDIDATE_COUNT
    chunks from that combined ranking are then rescored by a
    multilingual cross-encoder reranking model, which is more
    accurate than RRF but too slow to run on the whole document, and
    the final top_k chunks are picked from the reranked results.
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
    # Hybrid dense + lexical (trigram) search, combined
    # with Reciprocal Rank Fusion
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

    for chunk_id, chunk, rerank_score in reranked_candidates:

        dense_similarity = dense_similarity_by_chunk_id.get(
            chunk_id, 0.0
        )


        retrieved_chunks.append(
            RetrievedChunk(
                id=chunk.id,
                content=chunk.content,
                page_number=chunk.page_number,
                # Reported similarity stays the dense/embedding
                # similarity (0.0 if the chunk had no embedding). It
                # drives no filtering decision and is no longer shown
                # to the student: e5 scores nearly everything between
                # 0.77 and 0.88, so the number looked meaningful and
                # was not. It is still returned in the API response.
                similarity=dense_similarity,
                rerank_score=rerank_score,
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
# BUILD CLAUDE MESSAGES
# =========================================================

def _build_conversation_messages(
    conversation_history: list[dict] | None,
    current_content: str,
) -> list[dict]:
    """
    Build an Anthropic messages list from the previous conversation
    followed by the current turn, dropping any history entry with an
    unusable role or empty content.
    """

    if conversation_history is None:
        conversation_history = []

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

    messages.append(
        {
            "role": "user",
            "content": current_content,
        }
    )

    return messages


# =========================================================
# REWRITE FOLLOW-UP QUESTION
# =========================================================

def rewrite_question_with_history(
    question: str,
    conversation_history: list[dict] | None,
) -> str:
    """
    Turn a short follow-up message into a standalone question,
    using the conversation history to resolve what it refers to.

    "explain that more simply" carries almost no searchable content
    on its own, so retrieving with it directly finds nothing. Asking
    the model what "that" meant produces a question that can be
    searched for.

    This step must never break a chat request. Any failure - an API
    error, an empty reply, or a reply long enough to be an
    explanation rather than a question - returns the original
    question unchanged, and the caller simply carries on with what
    the student actually typed.

    No document context is sent to this call.
    """

    try:

        client = get_anthropic_client()

        messages = _build_conversation_messages(
            conversation_history,
            question,
        )

        response = client.messages.create(
            model=get_fast_claude_model(),
            max_tokens=200,
            system=REWRITE_SYSTEM_PROMPT,
            messages=messages,
        )

        rewritten_parts = [
            block.text
            for block in response.content
            if block.type == "text"
        ]

        rewritten = "\n".join(rewritten_parts).strip()

        # The prompt forbids quotation marks, but a stray pair
        # would be searched for literally, so drop them.
        if len(rewritten) >= 2:
            if rewritten[0] == '"' and rewritten[-1] == '"':
                rewritten = rewritten[1:-1].strip()

        if not rewritten:
            logger.warning(
                "Query rewrite returned nothing; "
                "using the original question"
            )
            return question

        maximum_length = max(
            REWRITE_MAX_LENGTH_FLOOR,
            REWRITE_MAX_LENGTH_RATIO * len(question),
        )

        if len(rewritten) > maximum_length:
            logger.warning(
                "Query rewrite returned %s characters for a %s "
                "character question, which looks like an "
                "explanation rather than a question; using the "
                "original question",
                len(rewritten),
                len(question),
            )
            return question

        return rewritten

    except Exception:

        logger.warning(
            "Query rewrite failed; using the original question",
            exc_info=True,
        )

        return question


# =========================================================
# GENERATE GENERAL KNOWLEDGE ANSWER WITH CLAUDE
# =========================================================

def generate_general_answer_with_claude(
    question: str,
    conversation_history: list[dict] | None = None,
) -> str:
    """
    Answer a question that retrieval could not find in the
    student's document, using general knowledge instead.

    This is the path for a student who asks "what is 5+5" or "what
    can you do" while a document is open. Returning a dead end
    there is worse than answering, so the model is given a prompt
    that permits outside knowledge and asked to decide whether the
    question deserves a real answer, a description of StudyMate, or
    a polite refusal.

    No document context is sent to this call.
    """

    # -----------------------------------------------------
    # Create Anthropic client
    # -----------------------------------------------------

    client = get_anthropic_client()

    # -----------------------------------------------------
    # Get Claude model from .env
    # -----------------------------------------------------
    #
    # The main model, not the fast one: the student reads this
    # answer, so its quality matters as much as a document answer.

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

    messages = _build_conversation_messages(
        conversation_history,
        question,
    )

    # -----------------------------------------------------
    # Call Claude
    # -----------------------------------------------------

    try:

        response = client.messages.create(
            model=claude_model,
            max_tokens=1000,
            system=GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
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

#تعديل الحركات
# Pages Claude names in its own answer, used to show the student only
# the sources the answer actually drew on.
CITATION_PATTERN = re.compile(r"\[Page (\d+)\]", re.IGNORECASE)


def select_chunks_for_answer(
    chunks: list[RetrievedChunk],
) -> list[RetrievedChunk]:
    """
    Decide whether the retrieved chunks answer the question at all.

    MINIMUM_RERANK_SCORE is applied to the BEST chunk, not to each one
    separately, because those are two different decisions.

    Whether the document contains an answer is a property of the whole
    result, and the measured threshold answers it well. Which chunks
    Claude should read is a question of ORDER, and the reranker has
    already answered it - the list arrives sorted. Filtering that
    sorted list by the same number discards correct context whenever
    the reranker ranks a chunk highly but scores it below the cut-off,
    which it does on Arabic: the page reading "اللبؤة: أنثى الأسد"
    scores -1.06 while a page that merely mentions hunting tops the
    list at +0.59.

    Measured by asking Claude the same questions under both rules:
    the lioness question went from "the text does not explain its
    meaning" to "أنثى الأسد [Page 94]"; the passive-voice answer
    gained two correct rules it had been missing; and on a question
    where three extra chunks were irrelevant, Claude ignored all
    three and answered identically. No answer became less correct.
    The cost is length: answers can wander onto neighbouring material,
    which is visible in the English frame-buffer answer.
    """

    scores = [
        chunk.rerank_score
        for chunk in chunks
        if chunk.rerank_score is not None
    ]

    if not scores or max(scores) < MINIMUM_RERANK_SCORE:
        return []

    return chunks


def build_sources(
    answer: str,
    chunks: list[RetrievedChunk],
) -> list[dict]:
    """
    Show the student only the pages the answer actually used.

    Claude now reads every chunk the reranker returned, so displaying
    all of them would put a confident-looking citation beside pages the
    answer never touched - five sources for the lioness question, of
    which it used one. The answer names its pages as [Page N], so those
    are the ones shown. When it names none, the chunks that clear the
    threshold on their own are shown instead.
    """

    cited_pages = {
        int(page)
        for page in CITATION_PATTERN.findall(answer)
    }

    if cited_pages:
        selected = [
            chunk
            for chunk in chunks
            if chunk.page_number in cited_pages
        ]
    else:
        selected = [
            chunk
            for chunk in chunks
            if chunk.rerank_score is not None
            and chunk.rerank_score >= MINIMUM_RERANK_SCORE
        ]

    return [
        {
            "chunk_id": str(chunk.id),
            "page_number": chunk.page_number,
            "content": chunk.content,
            "similarity": round(chunk.similarity, 4),
        }
        for chunk in selected
    ]
#----------------the end
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
    2. Check the input gate for trivial small talk
    3. Retrieve relevant chunks, and decide from the BEST reranker
       score whether the document answers the question at all
    4. If nothing survived and there is conversation history,
       rewrite the question into a standalone one and retrieve
       again with it
    5. If nothing survived either way, answer from general
       knowledge with no sources
    6. Otherwise send conversation history + document context
       + current question to Claude
    7. Return answer and sources

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
#تعديل الحركات 2
    relevant_chunks = select_chunks_for_answer(chunks)
#the end
    used_rewrite = False

    # -----------------------------------------------------
    # Retry retrieval using a rewritten question
    # -----------------------------------------------------
    #
    # A short follow-up ("explain that more simply") carries
    # almost no searchable content on its own, so the search
    # above finds nothing. Ask the model what the message
    # actually refers to, and search again with that.
    #
    # The question is rewritten rather than concatenated with
    # the previous turn: pasting the last question and answer
    # in front of the current one searches for the PREVIOUS
    # topic, which is why "5+5" used to come back with five
    # unrelated chunks all scoring above +6.8.

    if not relevant_chunks and conversation_history:

        rewritten_question = rewrite_question_with_history(
            question=question,
            conversation_history=conversation_history,
        )

        # An unchanged rewrite means the question was already
        # self-contained, so a second identical search would
        # return the same nothing at the same cost.
        if rewritten_question != question:

            chunks = retrieve_relevant_chunks(
                db=db,
                document_id=document_id,
                question=rewritten_question,
            )
#تعديل الحركات 3
            relevant_chunks = select_chunks_for_answer(chunks)
#the end
            if relevant_chunks:
                used_rewrite = True
                logger.info(
                    "Answer path: document-after-rewrite | "
                    "original=%r | rewritten=%r",
                    question,
                    rewritten_question,
                )

    # -----------------------------------------------------
    # Nothing in the document: answer from general knowledge
    # -----------------------------------------------------
    #
    # A student who asks something their document does not
    # cover is better served by an answer than by a dead end.

    if not relevant_chunks:

        logger.info("Answer path: general-knowledge")

        answer = generate_general_answer_with_claude(
            question=question,
            conversation_history=conversation_history,
        )

        return {
            "answer": answer,
            "sources": [],
        }

    if not used_rewrite:
        logger.info("Answer path: document")

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
#تعديل الحركات 4 
    sources = build_sources(answer, relevant_chunks)
#the end
    # -----------------------------------------------------
    # Return final RAG response
    # -----------------------------------------------------

    return {
        "answer": answer,
        "sources": sources,
    }