from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from backend.auth import (
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)


# =========================================================
# TEST hash_password
# =========================================================

def test_hash_password_returns_different_string_than_input():
    password = "SuperSecret123!"

    result = hash_password(password)

    assert result != password


def test_hash_password_returns_bcrypt_hash_format():
    password = "SuperSecret123!"

    result = hash_password(password)

    assert result.startswith(("$2b$", "$2a$"))


def test_hash_password_same_password_produces_different_hashes():
    password = "SuperSecret123!"

    first_hash = hash_password(password)
    second_hash = hash_password(password)

    assert first_hash != second_hash


# =========================================================
# TEST verify_password
# =========================================================

def test_verify_password_correct_password_returns_true():
    password = "SuperSecret123!"
    hashed = hash_password(password)

    result = verify_password(password, hashed)

    assert result is True


def test_verify_password_incorrect_password_returns_false():
    hashed = hash_password("SuperSecret123!")

    result = verify_password("WrongPassword", hashed)

    assert result is False


def test_verify_password_empty_password_returns_false():
    hashed = hash_password("SuperSecret123!")

    result = verify_password("", hashed)

    assert result is False


# =========================================================
# TEST create_access_token
# =========================================================

def test_create_access_token_returns_string():
    result = create_access_token({"sub": "user-123"})

    assert isinstance(result, str)
    assert len(result) > 0


def test_create_access_token_default_expiry_sets_exp_about_60_minutes():
    before = datetime.now(timezone.utc)

    token = create_access_token({"sub": "user-123"})

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    expires_at = datetime.fromtimestamp(
        payload["exp"], tz=timezone.utc
    )
    expected = before + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    assert abs((expires_at - expected).total_seconds()) < 5


def test_create_access_token_custom_expires_delta_is_respected():
    before = datetime.now(timezone.utc)

    token = create_access_token(
        {"sub": "user-123"},
        expires_delta=timedelta(minutes=5),
    )

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    expires_at = datetime.fromtimestamp(
        payload["exp"], tz=timezone.utc
    )
    expected = before + timedelta(minutes=5)

    assert abs((expires_at - expected).total_seconds()) < 5


def test_create_access_token_sets_type_access():
    token = create_access_token({"sub": "user-123"})

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["type"] == "access"


def test_create_access_token_preserves_custom_claims():
    token = create_access_token(
        {"sub": "user-123", "role": "admin"}
    )

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["sub"] == "user-123"
    assert payload["role"] == "admin"


def test_create_access_token_does_not_mutate_input_data():
    data = {"sub": "user-123"}

    create_access_token(data)

    assert data == {"sub": "user-123"}


# =========================================================
# TEST create_refresh_token
# =========================================================

def test_create_refresh_token_returns_string():
    result = create_refresh_token({"sub": "user-123"})

    assert isinstance(result, str)
    assert len(result) > 0


def test_create_refresh_token_sets_type_refresh():
    token = create_refresh_token({"sub": "user-123"})

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["type"] == "refresh"


def test_create_refresh_token_expiry_is_about_30_days():
    before = datetime.now(timezone.utc)

    token = create_refresh_token({"sub": "user-123"})

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    expires_at = datetime.fromtimestamp(
        payload["exp"], tz=timezone.utc
    )
    expected = before + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )

    assert abs((expires_at - expected).total_seconds()) < 5


def test_create_refresh_token_preserves_custom_claims():
    token = create_refresh_token({"sub": "user-123"})

    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["sub"] == "user-123"


# =========================================================
# TEST decode_refresh_token
# =========================================================

def test_decode_refresh_token_valid_token_returns_user_id():
    token = create_refresh_token({"sub": "user-123"})

    result = decode_refresh_token(token)

    assert result == "user-123"


def test_decode_refresh_token_rejects_access_token():
    token = create_access_token({"sub": "user-123"})

    with pytest.raises(HTTPException) as exc_info:
        decode_refresh_token(token)

    assert exc_info.value.status_code == 401


def test_decode_refresh_token_rejects_garbage_token():
    with pytest.raises(HTTPException) as exc_info:
        decode_refresh_token("not-a-valid-jwt-token")

    assert exc_info.value.status_code == 401


def test_decode_refresh_token_rejects_expired_token():
    expired_payload = {
        "sub": "user-123",
        "type": "refresh",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    token = jwt.encode(
        expired_payload, SECRET_KEY, algorithm=ALGORITHM
    )

    with pytest.raises(HTTPException) as exc_info:
        decode_refresh_token(token)

    assert exc_info.value.status_code == 401


def test_decode_refresh_token_rejects_token_missing_sub():
    payload = {
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    with pytest.raises(HTTPException) as exc_info:
        decode_refresh_token(token)

    assert exc_info.value.status_code == 401


def test_decode_refresh_token_exception_detail_message():
    with pytest.raises(HTTPException) as exc_info:
        decode_refresh_token("not-a-valid-jwt-token")

    assert exc_info.value.detail == "Invalid or expired refresh token"
