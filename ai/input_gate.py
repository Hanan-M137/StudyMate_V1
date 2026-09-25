import logging
import math
import re
from functools import lru_cache

from .embedding_service import generate_gate_embedding

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
# fallback further down run.
#
# That fallback deliberately uses its OWN model
# (GATE_MODEL_NAME in embedding_service.py), not the one
# retrieval uses. Retrieval only cares which chunk ranks
# highest, so an absolute score never matters there; this
# gate is nothing BUT an absolute score against a threshold.
# multilingual-e5-small, which retrieval now uses, compresses
# every score into a narrow high band: measured on the gate's
# own task, its lowest greeting scored 0.9011 and its highest
# real question 0.8989, a separation of 0.0022. On this
# model the same measurement gives 0.6288 against 0.5003.
# Keeping the two apart also means the threshold below no
# longer breaks whenever the retrieval model changes - which
# is exactly how it broke.

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

# Everyday Arabic small talk that students type but the lists
# above lack. Matched only by the Arabic keyword path below.
#
# Kept out of TRIVIAL_PATTERNS on purpose: that set also seeds
# TRIVIAL_REFERENCE_PHRASES, so adding phrases there would move
# the English semantic scores, which this list must not do.
#
# Each entry is a complete message on its own. Matching is
# exact whole-message membership, so a phrase here can only
# ever match a message that IS that phrase.
ARABIC_DIALECT_PATTERNS = {
    "مشكور",
    "يسلمو",
    "تسلم",
    "باي",
    "صباح النور",
    "مساء النور",
}


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

# Arabic never reaches the semantic fallback: it uses the
# normalized keyword match and nothing else. Both candidate
# models were measured on this task, and neither separates
# Arabic greetings from real Arabic questions:
#
#   all-MiniLM-L6-v2 - greetings 0.7111-0.9718, questions
#     0.6725-0.8731; at any cut-off that catches every
#     greeting, 9 of 10 real questions are swallowed.
#   multilingual-e5-small (commit 4bce461, 2026-09-11) -
#     6 of 20 real questions swallowed.
#   multilingual-e5-small re-measured 2026-09-25 with the
#     "query: " prefix on both sides - 15 of 20 real
#     questions score at or above the lowest greeting
#     (0.8383), and a threshold set for zero swallowed
#     questions on one half of the sample swallowed one
#     ("مرحبا، ما هو المبتدأ؟") on the other half.
#
# A swallowed question costs the student their answer; a
# missed greeting costs one retrieval. So Arabic gets no
# model until one separates the two cleanly.

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
        (phrase, tuple(generate_gate_embedding(phrase)))
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
# ARABIC NORMALIZATION
# =========================================================
#
# Exact matching treats one Arabic greeting spelled several
# ways as different strings: with or without diacritics
# (شُكْرًا / شكرا), with any alef form (أهلا / اهلا), ة or ه at
# the end (العافية / العافيه), ى or ي (إلى / الى). The same
# folding is applied to the patterns and to the message, so
# the comparison is still an exact whole-message match - only
# the spelling noise is gone.
#
# These rules are exactly the configuration measured on
# 2026-09-25 over 40 Arabic messages (20 small talk, 20 real
# questions): 0 real questions swallowed, and greetings caught
# up from 0 of 20 to 7 of 20. Changing a rule invalidates that
# measurement.

# Harakat and tanween (U+064B-U+0652), dagger alef (U+0670),
# tatweel (U+0640).
ARABIC_DIACRITICS_PATTERN = re.compile(r"[\u064B-\u0652\u0670\u0640]")

ALEF_VARIANTS_PATTERN = re.compile(r"[أإآ]")

# Single-letter prefixes (و "and", ف "so", ب "with") that
# attach directly to the next word: "وشكرا".
ARABIC_ATTACHED_PREFIXES = ("و", "ف", "ب")

ARABIC_DEFINITE_ARTICLE = "ال"


def _normalize_arabic(text: str) -> str:
    """
    Strip diacritics and tatweel, and fold alef, ta marbuta
    and alef maqsura to one form each.
    """

    text = ARABIC_DIACRITICS_PATTERN.sub("", text)
    text = ALEF_VARIANTS_PATTERN.sub("ا", text)
    text = text.replace("ة", "ه").replace("ى", "ي")

    return text


ARABIC_TRIVIAL_PATTERNS = {
    _normalize_arabic(pattern)
    for pattern in TRIVIAL_PATTERNS | ARABIC_DIALECT_PATTERNS
}


def _is_arabic_trivial(normalized: str) -> bool:
    """
    Normalized exact match for an Arabic message.

    Every rule below still requires the WHOLE message to be a
    pattern. A prefix or article is only removed or added when
    the result is itself a pattern, so "مرحبا، ما هو المبتدأ"
    can never match "مرحبا".
    """

    folded = _normalize_arabic(normalized)

    if folded in ARABIC_TRIVIAL_PATTERNS:
        return True

    # One attached prefix: "وشكرا" -> "شكرا".
    if (
        folded[:1] in ARABIC_ATTACHED_PREFIXES
        and folded[1:] in ARABIC_TRIVIAL_PATTERNS
    ):
        return True

    # With or without the definite article:
    # "سلام عليكم" <-> "السلام عليكم".
    if (
        folded.startswith(ARABIC_DEFINITE_ARTICLE)
        and folded[len(ARABIC_DEFINITE_ARTICLE):] in ARABIC_TRIVIAL_PATTERNS
    ):
        return True

    if ARABIC_DEFINITE_ARTICLE + folded in ARABIC_TRIVIAL_PATTERNS:
        return True

    return False


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
    including any failure to embed - returns False, so the
    message is treated as a real question.

    Arabic messages never reach this function; should_call_llm
    routes them to the keyword match only.
    """

    word_count = len(normalized.split())

    # Length guard first: it is free, and a message longer
    # than this can never be trivial no matter how similar it
    # looks, so there is no reason to embed it at all.
    if word_count > TRIVIAL_MAX_WORDS:
        return False

    try:
        message_embedding = generate_gate_embedding(normalized)
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

    is_trivial = best_similarity >= TRIVIAL_SIMILARITY_THRESHOLD

    # TEMPORARY diagnostic logging: kept only until
    # TRIVIAL_SIMILARITY_THRESHOLD has been calibrated against
    # real student messages. Remove once that value is settled.
    logger.info(
        "Input gate semantic check | word_count=%s | "
        "best_similarity=%.4f | best_phrase=%r | trivial=%s",
        word_count,
        best_similarity,
        best_phrase,
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
    # Arabic: normalized keyword match only, never the model
    # -----------------------------------------------------
    #
    # Routed on the normalized text - the same condition that
    # used to suppress the model's verdict for Arabic - so
    # every message that used to get a model verdict still
    # gets one, and no other message is embedded.

    if _looks_arabic(normalized):

        if _is_arabic_trivial(normalized):
            return False, CANNED_REPLY_AR

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