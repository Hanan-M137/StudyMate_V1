from functools import lru_cache

from sentence_transformers import SentenceTransformer


# =========================================================
# TWO MODELS, TWO JOBS
# =========================================================
#
# This module loads two embedding models on purpose, because the app
# asks two different questions of an embedding.
#
# RETRIEVAL asks which chunk is CLOSEST to a question. Only the ordering
# matters; the absolute score is never compared against anything fixed.
#
# THE INPUT GATE asks whether a message is ABOVE a threshold, to decide
# if it is small talk. There the absolute value is the whole decision.
#
# multilingual-e5-small wins the first question and loses the second.
# Measured on this project's own data, as the rank the correct page
# reached in the dense stage:
#
#                        English doc     Arabic textbook
#     all-MiniLM-L6-v2   1, 1, 3, 1      73, 4
#     multilingual-e5    1, 1, 2, 2      2, 14
#
# English is unchanged - both average rank 1.5 across four English
# questions - so the Arabic gain costs nothing there. But e5 compresses
# every score into a narrow high band, and for the gate that is fatal:
# the lowest greeting scored 0.9011 and the highest real question 0.8989,
# a separation of 0.0022, which is noise. The same measurement on
# all-MiniLM-L6-v2 gives 0.6288 against 0.5003 - a gap of 0.1285 and a
# threshold that survives wordings the calibration never saw.
#
# Keeping the gate on its own model also decouples its threshold from any
# future change of retrieval model, which is what broke it this time.


# =========================================================
# RETRIEVAL MODEL
# =========================================================
#
# e5 is trained with a prefix on every input: "query: " for text being
# searched WITH, "passage: " for text being searched THROUGH. The
# prefixes are not decoration - the model scores worse without them and
# worse still with the wrong one, silently and with no error - so every
# call has to say which kind of text it is passing.

EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-small"
EMBEDDING_DIMENSION = 384

QUERY_PREFIX = "query: "
PASSAGE_PREFIX = "passage: "


# =========================================================
# INPUT GATE MODEL
# =========================================================
#
# Used only by ai/input_gate.py, and only to compare a message with the
# reference greetings. Its threshold, TRIVIAL_SIMILARITY_THRESHOLD, is
# calibrated against THIS model and must be re-measured with
# check_gate.py if it is ever changed.

GATE_MODEL_NAME = "all-MiniLM-L6-v2"


def add_prefix(text: str, is_query: bool) -> str:
    """
    Add the prefix the retrieval model expects.

    A question the student asked is a query. A chunk of a document being
    searched is a passage.
    """

    prefix = QUERY_PREFIX if is_query else PASSAGE_PREFIX

    return prefix + text


# =========================================================
# LOAD MODELS
# =========================================================

@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    """
    Load the retrieval model once and reuse it.

    The model converts text into a
    384-dimensional vector.
    """

    model = SentenceTransformer(
        EMBEDDING_MODEL_NAME
    )

    return model


@lru_cache(maxsize=1)
def get_gate_model() -> SentenceTransformer:
    """
    Load the input gate's model once and reuse it.
    """

    model = SentenceTransformer(
        GATE_MODEL_NAME
    )

    return model


# =========================================================
# GENERATE SINGLE EMBEDDING
# =========================================================

def generate_embedding(
    text: str,
    is_query: bool = True,
) -> list[float]:
    """
    Generate a retrieval embedding for one text string.

    is_query defaults to True because the single-text function is used
    for the student's question. Pass is_query=False when embedding one
    piece of a document.

    Returns:
        A list containing 384 floating-point values.
    """

    # -----------------------------------------------------
    # Validate input
    # -----------------------------------------------------

    if not text or not text.strip():
        raise ValueError(
            "Cannot generate an embedding for empty text"
        )

    # -----------------------------------------------------
    # Load cached model
    # -----------------------------------------------------

    model = get_embedding_model()

    # -----------------------------------------------------
    # Generate embedding
    # -----------------------------------------------------

    embedding = model.encode(
        add_prefix(text.strip(), is_query),
        normalize_embeddings=True,
    )

    # -----------------------------------------------------
    # Validate embedding dimension
    # -----------------------------------------------------

    if len(embedding) != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Expected embedding dimension "
            f"{EMBEDDING_DIMENSION}, "
            f"but received {len(embedding)}"
        )

    # -----------------------------------------------------
    # Convert NumPy array to Python list
    # -----------------------------------------------------

    return embedding.tolist()


# =========================================================
# GENERATE INPUT GATE EMBEDDING
# =========================================================

def generate_gate_embedding(
    text: str,
) -> list[float]:
    """
    Generate an embedding for the input gate's similarity check.

    Deliberately NOT the retrieval model: see the note at the top of this
    file. Nothing produced here is ever stored or compared with a stored
    chunk, so the two models never meet.
    """

    if not text or not text.strip():
        raise ValueError(
            "Cannot generate an embedding for empty text"
        )

    model = get_gate_model()

    embedding = model.encode(
        text.strip(),
        normalize_embeddings=True,
    )

    return embedding.tolist()


# =========================================================
# GENERATE MULTIPLE EMBEDDINGS
# =========================================================

def generate_embeddings(
    texts: list[str],
    is_query: bool = False,
) -> list[list[float]]:
    """
    Generate retrieval embeddings for multiple texts in one batch.

    Batch processing is faster than encoding
    every chunk separately.

    is_query defaults to False because the batch function is used for
    document chunks.

    Returns:
        A list of 384-dimensional embeddings.
    """

    # -----------------------------------------------------
    # Clean input texts
    # -----------------------------------------------------

    cleaned_texts = [
        text.strip()
        for text in texts
        if text and text.strip()
    ]

    # -----------------------------------------------------
    # Nothing to process
    # -----------------------------------------------------

    if not cleaned_texts:
        return []

    # -----------------------------------------------------
    # Add the prefix the model expects
    # -----------------------------------------------------

    prefixed_texts = [
        add_prefix(text, is_query)
        for text in cleaned_texts
    ]

    # -----------------------------------------------------
    # Load cached model
    # -----------------------------------------------------

    model = get_embedding_model()

    # -----------------------------------------------------
    # Generate embeddings in batch
    # -----------------------------------------------------

    embeddings = model.encode(
        prefixed_texts,
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=False,
    )

    # -----------------------------------------------------
    # Validate embedding dimensions
    # -----------------------------------------------------

    for embedding in embeddings:
        if len(embedding) != EMBEDDING_DIMENSION:
            raise ValueError(
                f"Expected embedding dimension "
                f"{EMBEDDING_DIMENSION}, "
                f"but received {len(embedding)}"
            )

    # -----------------------------------------------------
    # Convert NumPy arrays to Python lists
    # -----------------------------------------------------

    return embeddings.tolist()