import logging
import math
import re
from functools import lru_cache

from .embedding_service import generate_embedding


# =========================================================
# LOGGING
# =========================================================

logger = logging.getLogger(__name__)


# =========================================================
# TRIVIAL MESSAGE PATTERNS (INPUT GATE)
# =========================================================
#
# This module decides whether an incoming chat message is
# worth sending through the full RAG + Claude pipeline, or
# whether it is trivial small talk that should get an
# instant, free, canned reply instead.
#
# The first check is a rule-based exact match against the
# patterns below. It never calls a model, so it stays free
# and instant. Only when that misses does the semantic
# fallback further down run, which reuses the embedding
# model the app already loads for retrieval - no new model,
# no API call.

GREETING_PATTERNS = {
    # English
    "hi",
    "hello",
    "hey",
    "hiya",
    "yo",
    "good morning",
    "good afternoon",
    "good evening",
    # Arabic
    "مرحبا",
    "مرحبًا",
    "اهلا",
    "أهلا",
    "السلام عليكم",
    "سلام",
    "هلا",
}

CLOSING_PATTERNS = {
    # English
    "thanks",
    "thank you",
    "thx",
    "ok",
    "okay",
    "bye",
    "goodbye",
    "see you",
    # Arabic
    "شكرا",
    "شكرًا",
    "شكرا لك",
    "تمام",
    "مع السلامة",
    "يعطيك العافية",
}

TRIVIAL_PATTERNS = GREETING_PATTERNS | CLOSING_PATTERNS


CANNED_REPLY_EN = (
    "Hi! I'm StudyMate, your study assistant. "
    "Ask me anything about your document and I'll help you out."
)

CANNED_REPLY_AR = (
    "مرحبًا! أنا StudyMate، مساعدك الدراسي. "
    "اسألني أي سؤال متعلق بمستندك وسأساعدك."
)


# =========================================================
# SEMANTIC FALLBACK SETTINGS
# =========================================================

# A message is only ever judged trivial by the semantic
# fallback when BOTH of the two signals below agree. One
# signal on its own is not enough, because the cost of the
# two possible mistakes is not symmetric: wrongly calling a
# real question "trivial" silently replaces the student's
# answer with a canned greeting, while wrongly letting a
# greeting through merely wastes one cheap retrieval. When
# the two signals disagree, the message goes through as a
# real question.

# Signal 1 - length guard. A trivial message is short by
# nature. This exists so that a real question which happens
# to open with a greeting ("hello, I want to ask about
# chapter 3") is not swallowed by the gate: it embeds close
# to "hello", but it is far too long to be small talk.
TRIVIAL_MAX_WORDS = 6

# Signal 2 - semantic similarity. Minimum cosine similarity
# between the message and the closest reference phrase below
# for the message to count as small talk.
#
# PROVISIONAL VALUE - pending recalibration.
#
# First calibrated at 0.48 from a sample of 10 English
# questions whose highest score was 0.2689. That sample was
# not representative: it contained only textbook-style
# questions and no short conversational ones. The first real
# message to reach this check, "can you help me", scored
# 0.5003 against the reference phrase "thanks for your help"
# and was silently answered with a canned greeting instead of
# a real answer.
#
# The two phrases are close because the embedding model
# measures what a message is about, not what it wants: asking
# for help and thanking for help share their subject while
# being opposite in intent.
#
# 0.58 is a safety margin above that observed failure, not a
# calibrated value. It stands until the reference list is
# pruned of phrases that share content words with real
# questions, and the threshold is re-measured against a
# question sample that includes conversational wording.
TRIVIAL_SIMILARITY_THRESHOLD = 0.58

# The semantic fallback is applied to non-Arabic messages
# only. This is not a preference, it is a measurement.
#
# all-MiniLM-L6-v2 is English-trained and carries no usable
# Arabic semantics. Measured over 9 Arabic greetings and 10
# real Arabic questions against the full reference list:
#     greetings   0.7111 - 0.9718
#     questions   0.6725 - 0.8731
# The two ranges overlap almost entirely, so no threshold
# separates them: at any cut-off low enough to catch every
# greeting, 9 of the 10 real questions are swallowed and
# answered with a canned reply instead of a real one.
#
# The scores also show the model is not reading Arabic
# meaning at all. Most Arabic questions match "مع السلامة"
# ("goodbye") most closely - "ما هو الفاعل" ("what is the
# subject of a sentence") scores 0.8437 against it - and the
# only high greeting scores come from literal word overlap
# with a reference phrase, not from understanding.
#
# This is the same model weakness that rag_service.py already
# compensates for with hybrid search and reranking. A
# replacement was measured and does separate the two classes
# cleanly (paraphrase-multilingual-MiniLM-L12-v2, also 384
# dimensions, so a drop-in swap), but adopting it requires
# re-embedding every stored chunk and is a separate, open
# decision. Until then Arabic messages keep the exact-match
# behaviour they have always had, while their similarity is
# still computed and logged below, so calibration data keeps
# accumulating from real traffic.
APPLY_SEMANTIC_FALLBACK_TO_ARABIC = False

# The reference phrases an incoming message is compared
# against: every exact-match pattern above, plus natural
# variations of them in both languages that students
# actually type but that no fixed list can enumerate.
TRIVIAL_REFERENCE_PHRASES = tuple(sorted(TRIVIAL_PATTERNS)) + (
    # English variations
    "hello there",
    "hi there",
    "hey there",
    "good day",
    "how are you",
    "how are you doing",
    "what's up",
    "nice to meet you",
    "thanks a lot",
    "thank you so much",
    "many thanks",
    "thanks for your help",
    "appreciate it",
    "got it",
    "alright",
    "sounds good",
    "see you later",
    "have a good day",
    "goodnight",
    "take care",
    # Arabic variations
    "السلام عليكم ورحمة الله",
    "وعليكم السلام",
    "صباح الخير",
    "مساء الخير",
    "كيف حالك",
    "كيفك",
    "شلونك",
    "أهلا وسهلا",
    "شكرا جزيلا",
    "شكرا كثير",
    "الله يعطيك العافية",
    "جزاك الله خيرا",
    "ماشي",
    "تمام شكرا",
    "إلى اللقاء",
    "تصبح على خير",
    "في أمان الله",
)


# =========================================================
# REFERENCE PHRASE EMBEDDINGS
# =========================================================

@lru_cache(maxsize=1)
def _get_reference_embeddings() -> tuple[tuple[str, tuple[float, ...]], ...]:
    """
    Embed every reference phrase once, on first use.

    This is deliberately lazy rather than computed at import
    time: importing this module must not pull the embedding
    model into memory during application startup. The first
    message that actually reaches the semantic check pays
    for it, and every message afterwards reuses the cache.

    Returns:
        A tuple of (phrase, embedding) pairs.
    """

    return tuple(
        (phrase, tuple(generate_embedding(phrase)))
        for phrase in TRIVIAL_REFERENCE_PHRASES
    )


# =========================================================
# COSINE SIMILARITY
# =========================================================

def _cosine_similarity(
    left: tuple[float, ...] | list[float],
    right: tuple[float, ...] | list[float],
) -> float:
    """
    Cosine similarity between two vectors: the dot product
    divided by the product of the two vector norms.

    The norms are computed rather than assumed, so this stays
    correct even if the embedding model ever stops returning
    unit-length vectors.
    """

    dot_product = sum(x * y for x, y in zip(left, right))

    left_norm = math.sqrt(sum(x * x for x in left))
    right_norm = math.sqrt(sum(y * y for y in right))

    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0

    return dot_product / (left_norm * right_norm)


# =========================================================
# LANGUAGE DETECTION
# =========================================================

ARABIC_CHARACTER_PATTERN = re.compile(r"[\u0600-\u06FF]")


def _looks_arabic(message: str) -> bool:
    """
    Return True if the message contains Arabic script
    characters.
    """

    return bool(ARABIC_CHARACTER_PATTERN.search(message))


# =========================================================
# NORMALIZE MESSAGE FOR MATCHING
# =========================================================

def _normalize(message: str) -> str:
    """
    Lowercase, strip surrounding whitespace, and strip
    trailing punctuation so that "Hi!", "hi.", and "hi"
    all match the same pattern.
    """

    normalized = message.strip().lower()
    normalized = normalized.rstrip("!.؟?,،")

    return normalized


# =========================================================
# SEMANTIC TRIVIALITY CHECK
# =========================================================

def _is_semantically_trivial(normalized: str) -> bool:
    """
    Decide whether a message that missed the exact-match list
    is still small talk, by comparing it to the reference
    phrases in embedding space.

    Returns True only when the message is both short enough
    (TRIVIAL_MAX_WORDS) and close enough to a reference
    phrase (TRIVIAL_SIMILARITY_THRESHOLD). Anything else -
    including an Arabic message, and including any failure to
    embed - returns False, so the message is treated as a
    real question.
    """

    word_count = len(normalized.split())

    # Length guard first: it is free, and a message longer
    # than this can never be trivial no matter how similar it
    # looks, so there is no reason to embed it at all.
    if word_count > TRIVIAL_MAX_WORDS:
        return False

    try:
        message_embedding = generate_embedding(normalized)
        reference_embeddings = _get_reference_embeddings()
    except Exception:
        # Never let a gate failure break a real chat request.
        # When the check cannot run, the message goes through
        # to the full pipeline, which is the safe direction.
        logger.warning(
            "Input gate semantic check unavailable; "
            "treating message as a real question",
            exc_info=True,
        )
        return False

    best_similarity = 0.0
    best_phrase = None

    for phrase, reference_embedding in reference_embeddings:

        similarity = _cosine_similarity(
            message_embedding,
            reference_embedding,
        )

        if best_phrase is None or similarity > best_similarity:
            best_similarity = similarity
            best_phrase = phrase

    is_similar_enough = best_similarity >= TRIVIAL_SIMILARITY_THRESHOLD

    # See APPLY_SEMANTIC_FALLBACK_TO_ARABIC above: the score is
    # still computed and logged for Arabic, so the threshold can
    # be calibrated from real traffic, but it never decides the
    # verdict, because on this model it is not trustworthy for
    # Arabic and a wrong "trivial" costs the student their answer.
    is_arabic = _looks_arabic(normalized)
    suppressed_for_arabic = is_arabic and not APPLY_SEMANTIC_FALLBACK_TO_ARABIC

    is_trivial = is_similar_enough and not suppressed_for_arabic

    # TEMPORARY diagnostic logging: kept only until
    # TRIVIAL_SIMILARITY_THRESHOLD has been calibrated against
    # real student messages. Remove once that value is settled.
    logger.info(
        "Input gate semantic check | word_count=%s | "
        "best_similarity=%.4f | best_phrase=%r | arabic=%s | "
        "suppressed_for_arabic=%s | trivial=%s",
        word_count,
        best_similarity,
        best_phrase,
        is_arabic,
        suppressed_for_arabic,
        is_trivial,
    )

    return is_trivial


# =========================================================
# INPUT GATE
# =========================================================

def should_call_llm(message: str) -> tuple[bool, str | None]:
    """
    Decide whether a chat message deserves the full
    RAG + Claude pipeline, or whether it is trivial small
    talk that should get an instant canned reply instead.

    The fixed pattern list is checked first because it is
    free and instant. Only a message it does not recognise
    falls through to the semantic check, which catches
    wordings no fixed list can enumerate.

    Returns:
        (True, None) if the pipeline should run normally.
        (False, reply) if the message is trivial small talk;
        `reply` is a ready-to-send canned response in the
        same language as the message.
    """

    # -----------------------------------------------------
    # Normalize for matching
    # -----------------------------------------------------

    normalized = _normalize(message)

    # -----------------------------------------------------
    # Check against known trivial patterns
    # -----------------------------------------------------

    if normalized in TRIVIAL_PATTERNS:

        if _looks_arabic(message):
            return False, CANNED_REPLY_AR

        return False, CANNED_REPLY_EN

    # -----------------------------------------------------
    # Nothing left to compare against
    # -----------------------------------------------------

    if not normalized:
        return True, None

    # -----------------------------------------------------
    # Semantic fallback for wordings the fixed list above
    # does not cover
    # -----------------------------------------------------

    if _is_semantically_trivial(normalized):

        if _looks_arabic(message):
            return False, CANNED_REPLY_AR

        return False, CANNED_REPLY_EN

    # -----------------------------------------------------
    # Not trivial — let it go through the full pipeline
    # -----------------------------------------------------

    return True, None