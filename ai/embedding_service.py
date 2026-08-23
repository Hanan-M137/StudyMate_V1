from functools import lru_cache

from sentence_transformers import SentenceTransformer


# =========================================================
# EMBEDDING MODEL CONFIGURATION
# =========================================================

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384


# =========================================================
# LOAD EMBEDDING MODEL
# =========================================================

@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    """
    Load the embedding model once and reuse it.

    The model converts text into a
    384-dimensional vector.
    """

    model = SentenceTransformer(
        EMBEDDING_MODEL_NAME
    )

    return model


# =========================================================
# GENERATE SINGLE EMBEDDING
# =========================================================

def generate_embedding(
    text: str,
) -> list[float]:
    """
    Generate an embedding for one text string.

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
        text.strip(),
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
# GENERATE MULTIPLE EMBEDDINGS
# =========================================================

def generate_embeddings(
    texts: list[str],
) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in one batch.

    Batch processing is faster than encoding
    every chunk separately.

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
    # Load cached model
    # -----------------------------------------------------

    model = get_embedding_model()

    # -----------------------------------------------------
    # Generate embeddings in batch
    # -----------------------------------------------------

    embeddings = model.encode(
        cleaned_texts,
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