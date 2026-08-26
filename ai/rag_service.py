from dataclasses import dataclass
from uuid import UUID

from anthropic import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    RateLimitError,
)
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from backend.models import Chunk, Document

from .anthropic_client import get_anthropic_client
from .embedding_service import generate_embedding


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# RAG SETTINGS
# =========================================================

TOP_K = 5
MINIMUM_SIMILARITY = 0.30


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
3. If the answer is not supported by the document context, say:
   "I could not find this information in your document."
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
# RETRIEVE RELEVANT CHUNKS
# =========================================================

def retrieve_relevant_chunks(
    db: Session,
    document_id: UUID,
    question: str,
    top_k: int = TOP_K,
) -> list[RetrievedChunk]:
    """
    Retrieve the chunks most semantically similar
    to the student's question.
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

    # -----------------------------------------------------
    # Retrieve closest chunks
    # -----------------------------------------------------

    results = (
        db.query(Chunk, distance)
        .filter(
            Chunk.document_id == document_id,
            Chunk.embedding.isnot(None)
        )
        .order_by(distance)
        .limit(top_k)
        .all()
    )

    retrieved_chunks = []

    # -----------------------------------------------------
    # Convert cosine distance to similarity
    # -----------------------------------------------------

    for chunk, cosine_distance in results:

        similarity = (
            1.0 - float(cosine_distance)
        )

        retrieved_chunks.append(
            RetrievedChunk(
                id=chunk.id,
                content=chunk.content,
                page_number=chunk.page_number,
                similarity=similarity,
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
    # Retrieve relevant chunks
    # -----------------------------------------------------

    chunks = retrieve_relevant_chunks(
        db=db,
        document_id=document_id,
        question=question,
    )

    # -----------------------------------------------------
    # Filter by similarity
    # -----------------------------------------------------

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