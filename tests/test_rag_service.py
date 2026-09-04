"""
Unit tests for the pure (no database, no network) helper functions
in ai/rag_service.py: Arabic question detection and Reciprocal Rank
Fusion score combination.

Note: importing ai.rag_service also loads the sentence-transformers
embedding model, so the first run of this file may take a bit
longer and print a one-time "Loading weights" message — this is
expected and matches what already happens elsewhere in the app.
"""

import pytest

from ai.rag_service import compute_rrf_scores, is_arabic_question, RRF_K


# =========================================================
# TEST is_arabic_question
# =========================================================

def test_is_arabic_question_pure_arabic():
    assert is_arabic_question("ما هو عنوان الكتاب؟") is True


def test_is_arabic_question_pure_english():
    assert is_arabic_question("What is the title of the book?") is False


def test_is_arabic_question_mostly_arabic_with_some_english():
    assert is_arabic_question(
        "ما هو title الكتاب الذي نقرأه اليوم"
    ) is True


def test_is_arabic_question_mostly_english_with_some_arabic():
    assert is_arabic_question(
        "What هو this book really about today"
    ) is False


def test_is_arabic_question_equal_counts_is_not_arabic():
    # Equal Arabic and Latin letter counts must NOT count as
    # Arabic — the function requires a strict majority, not a tie.
    assert is_arabic_question("ab اب") is False


def test_is_arabic_question_empty_string():
    assert is_arabic_question("") is False


# =========================================================
# TEST compute_rrf_scores
# =========================================================

def test_compute_rrf_scores_chunk_ranked_first_in_all_three_lists():
    scores = compute_rrf_scores(
        chunk_ids=["a"],
        dense_rank_by_chunk_id={"a": 1},
        similarity_rank_by_chunk_id={"a": 1},
        word_similarity_rank_by_chunk_id={"a": 1},
        rrf_k=60,
    )

    expected = 3 * (1.0 / 61)

    assert scores["a"] == pytest.approx(expected)


def test_compute_rrf_scores_chunk_found_in_only_one_list():
    scores = compute_rrf_scores(
        chunk_ids=["a"],
        dense_rank_by_chunk_id={"a": 5},
        similarity_rank_by_chunk_id={},
        word_similarity_rank_by_chunk_id={},
        rrf_k=60,
    )

    expected = 1.0 / 65

    assert scores["a"] == pytest.approx(expected)


def test_compute_rrf_scores_chunk_missing_from_every_list_scores_zero():
    scores = compute_rrf_scores(
        chunk_ids=["a"],
        dense_rank_by_chunk_id={},
        similarity_rank_by_chunk_id={},
        word_similarity_rank_by_chunk_id={},
    )

    assert scores["a"] == 0.0


def test_compute_rrf_scores_higher_combined_rank_wins():
    # "a" is ranked 1st everywhere; "b" is ranked 2nd everywhere.
    # "a" must end up with a strictly higher combined score.
    scores = compute_rrf_scores(
        chunk_ids=["a", "b"],
        dense_rank_by_chunk_id={"a": 1, "b": 2},
        similarity_rank_by_chunk_id={"a": 1, "b": 2},
        word_similarity_rank_by_chunk_id={"a": 1, "b": 2},
    )

    assert scores["a"] > scores["b"]


def test_compute_rrf_scores_default_rrf_k_matches_module_constant():
    # The default rrf_k argument must really be the module's RRF_K
    # constant, so the two values can never silently drift apart.
    scores_default = compute_rrf_scores(
        chunk_ids=["a"],
        dense_rank_by_chunk_id={"a": 3},
        similarity_rank_by_chunk_id={},
        word_similarity_rank_by_chunk_id={},
    )
    scores_explicit = compute_rrf_scores(
        chunk_ids=["a"],
        dense_rank_by_chunk_id={"a": 3},
        similarity_rank_by_chunk_id={},
        word_similarity_rank_by_chunk_id={},
        rrf_k=RRF_K,
    )

    assert scores_default["a"] == scores_explicit["a"]