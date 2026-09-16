"""
Unit tests for the shared password rule check in backend.main.

No HTTP client and no database: validate_password is a plain
function, and calling it directly is what makes these tests say
something about the rule itself rather than about FastAPI's
wiring. The endpoints that call it are covered elsewhere.
"""

import pytest
from fastapi import HTTPException

from backend.main import MIN_PASSWORD_LENGTH, validate_password


# =========================================================
# ACCEPTED PASSWORDS
# =========================================================

def test_eight_characters_with_letter_and_digit_is_accepted():
    # Exactly MIN_PASSWORD_LENGTH characters: the boundary the
    # rule is written around, so it is the one worth pinning.
    password = "abcdefg1"

    assert len(password) == MIN_PASSWORD_LENGTH

    # No exception means accepted; the function returns None.
    assert validate_password(password) is None


def test_arabic_password_with_a_digit_is_accepted():
    """
    The case a regex would have broken.

    A [a-zA-Z] character class would decide this password holds
    no letters and refuse it, which would lock out the students
    this app was built for. str.isalpha() is true for Arabic
    letters, so the rule means "a letter" and not "a Latin
    letter".
    """

    password = "كلمةالسر1"

    assert len(password) >= MIN_PASSWORD_LENGTH

    assert validate_password(password) is None


# =========================================================
# REJECTED PASSWORDS
# =========================================================

def test_seven_characters_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_password("abcdef1")

    assert exc_info.value.status_code == 400
    assert "8 characters" in exc_info.value.detail


def test_letters_only_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_password("abcdefghij")

    assert exc_info.value.status_code == 400
    assert "digit" in exc_info.value.detail


def test_digits_only_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        validate_password("1234567890")

    assert exc_info.value.status_code == 400
    assert "letter" in exc_info.value.detail


# =========================================================
# THE MESSAGE NAMES EVERY BROKEN RULE
# =========================================================

def test_message_for_two_broken_rules_mentions_both():
    """
    Reporting only the first failure turns one mistake into
    several round trips: the student lengthens the password,
    submits, and only then hears about the missing digit.
    """

    # Too short AND no digit - two rules broken at once.
    with pytest.raises(HTTPException) as exc_info:
        validate_password("abc")

    detail = exc_info.value.detail

    assert "8 characters" in detail
    assert "digit" in detail
