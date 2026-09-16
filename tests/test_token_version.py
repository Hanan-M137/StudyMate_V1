"""
Tests for the token_version check inside get_current_user.

What is being pinned down: an access token carries a "ver" claim,
the users table carries a token_version column, and get_current_user
refuses the token with a 401 when the two differ.

That one comparison is what makes signing out and changing a
password actually end existing sessions. Without it both still
appear to work - the endpoints return, the browser gets fresh
tokens, the UI looks right - while every token handed out before
the sign-out keeps working forever. Nothing else in the suite
touches it, so it could be deleted with all tests still green.

No database here. get_current_user needs a session only to look one
user up, so a stub that answers that one query is enough, and it
keeps these tests about the version comparison rather than about
SQLAlchemy.
"""

import pytest
from fastapi import HTTPException

from backend.auth import create_access_token, get_current_user


# =========================================================
# STUBS
# =========================================================

class StubUser:
    """
    Stands in for a User row.

    get_current_user reads nothing but token_version off the user
    it loads, and returns the object untouched, so those are the
    only two things this needs to get right.
    """

    def __init__(self, token_version: int):
        self.id = "11111111-1111-1111-1111-111111111111"
        self.token_version = token_version


class StubSession:
    """
    The smallest thing that satisfies

        db.query(User).filter(...).first()

    The filter is accepted and ignored: which row comes back is
    fixed by the test, and reimplementing the lookup here would
    only test the stub.
    """

    def __init__(self, user):
        self._user = user

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._user


def token_for(user_id: str, version=None) -> str:
    """
    Mint a real access token, signed the way the app signs them.

    version=None mints a token with no "ver" claim at all - the
    shape of every token issued before this feature existed.
    """

    data = {"sub": user_id}

    if version is not None:
        data["ver"] = version

    return create_access_token(data=data)


# =========================================================
# THE VERSIONS AGREE
# =========================================================

def test_matching_version_returns_the_user():
    user = StubUser(token_version=3)

    result = get_current_user(
        token=token_for(user.id, version=3),
        db=StubSession(user),
    )

    assert result is user


# =========================================================
# THE VERSIONS DISAGREE
# =========================================================

def test_token_version_lower_than_user_is_rejected():
    """
    The ordinary revocation case: the token was minted, then the
    student signed out or changed their password and the column
    moved past it.
    """

    user = StubUser(token_version=5)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            token=token_for(user.id, version=4),
            db=StubSession(user),
        )

    assert exc_info.value.status_code == 401


def test_token_version_higher_than_user_is_rejected():
    """
    The check is an inequality, not "older than".

    A token claiming a version the account has never reached did
    not come from this application, so it is refused for the same
    reason - writing the check as `<` instead would accept it.
    """

    user = StubUser(token_version=2)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            token=token_for(user.id, version=7),
            db=StubSession(user),
        )

    assert exc_info.value.status_code == 401


# =========================================================
# TOKENS MINTED BEFORE "ver" EXISTED
# =========================================================

def test_token_without_ver_claim_is_accepted_at_version_zero():
    """
    Deliberate migration behaviour, not an oversight.

    get_current_user reads the claim as payload.get("ver", 0), and
    every user row starts at token_version 0. So a token issued
    before this feature shipped keeps working until its owner
    signs out once - which is the whole point: adding revocation
    was not allowed to sign the entire user base out at deploy.

    This test exists so that nobody later reads the default as a
    hole and "fixes" it by rejecting claimless tokens.
    """

    user = StubUser(token_version=0)

    result = get_current_user(
        token=token_for(user.id, version=None),
        db=StubSession(user),
    )

    assert result is user


def test_token_without_ver_claim_is_rejected_once_user_has_moved_on():
    """
    The other half of the migration: the grace lasts exactly until
    the account revokes anything. Once token_version is 1 or more,
    a claimless token is an old token and is refused like any
    other.
    """

    user = StubUser(token_version=1)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(
            token=token_for(user.id, version=None),
            db=StubSession(user),
        )

    assert exc_info.value.status_code == 401
