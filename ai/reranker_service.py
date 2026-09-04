from sentence_transformers import CrossEncoder

# =========================================================
# RERANKER SETTINGS
# =========================================================
#
# A multilingual cross-encoder reranking model. Unlike the dense
# embedding model, a cross-encoder looks at the question and a
# candidate chunk together (not as two separate precomputed
# vectors), which makes it slower per comparison but more accurate
# at judging true relevance. This is why it is only ever run on a
# small shortlist of candidates, never on a whole document.
#
# This model supports Arabic among many other languages and is
# small enough to run reasonably on CPU.
RERANKER_MODEL_NAME = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"


# =========================================================
# MODEL LOADING
# =========================================================

_reranker_model: CrossEncoder | None = None


def get_reranker_model() -> CrossEncoder:
    """
    Load the cross-encoder reranking model once and reuse it across
    calls, exactly like the embedding model is loaded once and
    reused in embedding_service.py.
    """
    global _reranker_model

    if _reranker_model is None:
        _reranker_model = CrossEncoder(RERANKER_MODEL_NAME)

    return _reranker_model


# =========================================================
# RERANK
# =========================================================

def rerank(question: str, candidates: list[str]) -> list[float]:
    """
    Score each candidate chunk's relevance to the question using the
    cross-encoder reranking model.

    Returns a list of scores in the same order as `candidates`.
    A higher score means the model judges that chunk to be more
    relevant to the question.
    """
    if not candidates:
        return []

    model = get_reranker_model()

    pairs = [
        (question, candidate)
        for candidate in candidates
    ]

    scores = model.predict(pairs)

    return [float(score) for score in scores]