import re


# =========================================================
# TRIVIAL MESSAGE PATTERNS (INPUT GATE)
# =========================================================
#
# This module decides whether an incoming chat message is
# worth sending through the full RAG + Claude pipeline, or
# whether it is trivial small talk that should get an
# instant, free, canned reply instead.
#
# This is a rule-based check only. It never calls an LLM,
# so it stays free and instant.

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
# INPUT GATE
# =========================================================

def should_call_llm(message: str) -> tuple[bool, str | None]:
    """
    Decide whether a chat message deserves the full
    RAG + Claude pipeline, or whether it is trivial small
    talk that should get an instant canned reply instead.

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
    # Not trivial — let it go through the full pipeline
    # -----------------------------------------------------

    return True, None