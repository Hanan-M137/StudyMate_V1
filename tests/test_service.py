from ai.service import (
    clean_text,
    split_text_into_chunks,
)


# =========================================================
# TEST clean_text
# =========================================================

def test_clean_text_empty_string():
    result = clean_text("")

    assert result == ""


def test_clean_text_normalizes_line_endings():
    text = "Hello\r\nWorld\rTest"

    result = clean_text(text)

    assert result == "Hello World Test"


def test_clean_text_joins_hyphenated_words():
    text = "This is a hyphen-\nated word."

    result = clean_text(text)

    assert result == "This is a hyphenated word."


def test_clean_text_replaces_single_line_breaks_with_spaces():
    text = "Hello\nWorld"

    result = clean_text(text)

    assert result == "Hello World"


def test_clean_text_preserves_paragraph_boundaries():
    text = "First paragraph.\n\nSecond paragraph."

    result = clean_text(text)

    assert result == (
        "First paragraph.\n\n"
        "Second paragraph."
    )


def test_clean_text_collapses_multiple_spaces():
    text = "Hello     world\t\tagain"

    result = clean_text(text)

    assert result == "Hello world again"


def test_clean_text_collapses_excessive_blank_lines():
    text = "First\n\n\n\nSecond"

    result = clean_text(text)

    assert result == "First\n\nSecond"


def test_clean_text_strips_outer_whitespace():
    text = "   Hello world   "

    result = clean_text(text)

    assert result == "Hello world"


# =========================================================
# TEST split_text_into_chunks
# =========================================================

def test_split_text_empty_string():
    result = split_text_into_chunks("")

    assert result == []


def test_split_text_short_text_returns_one_chunk():
    text = "This is a short text."

    result = split_text_into_chunks(
        text,
        chunk_size=100,
        overlap=10,
    )

    assert result == [text]


def test_split_text_creates_multiple_chunks():
    text = (
        "This is the first sentence. "
        "This is the second sentence. "
        "This is the third sentence. "
        "This is the fourth sentence."
    )

    result = split_text_into_chunks(
        text,
        chunk_size=50,
        overlap=10,
    )

    assert len(result) > 1


def test_split_text_chunks_do_not_exceed_chunk_size_when_possible():
    text = (
        "This is a sentence. "
        "This is another sentence. "
        "This is a third sentence. "
        "This is a fourth sentence."
    )

    chunk_size = 50

    result = split_text_into_chunks(
        text,
        chunk_size=chunk_size,
        overlap=10,
    )

    for chunk in result:
        assert len(chunk) <= chunk_size


def test_split_text_uses_overlap():
    text = (
        "Sentence one is here. "
        "Sentence two is here. "
        "Sentence three is here. "
        "Sentence four is here."
    )

    result = split_text_into_chunks(
        text,
        chunk_size=40,
        overlap=10,
    )

    assert len(result) > 1

    # The beginning of a later chunk should overlap
    # with content near the end of the previous chunk.
    assert any(
        result[i][0:10] in result[i - 1]
        for i in range(1, len(result))
    )


def test_split_text_invalid_chunk_size():
    text = "Some text."

    try:
        split_text_into_chunks(
            text,
            chunk_size=0,
            overlap=0,
        )
        assert False
    except ValueError as error:
        assert str(error) == (
            "chunk_size must be greater than zero"
        )


def test_split_text_negative_overlap():
    text = "Some text."

    try:
        split_text_into_chunks(
            text,
            chunk_size=100,
            overlap=-1,
        )
        assert False
    except ValueError as error:
        assert str(error) == (
            "overlap cannot be negative"
        )


def test_split_text_overlap_must_be_smaller_than_chunk_size():
    text = "Some text."

    try:
        split_text_into_chunks(
            text,
            chunk_size=10,
            overlap=10,
        )
        assert False
    except ValueError as error:
        assert str(error) == (
            "overlap must be smaller than chunk_size"
        )