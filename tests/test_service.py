import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import pytest
from anthropic import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    RateLimitError,
)

from ai.service import (
    build_quiz_context,
    clean_text,
    extract_page_text,
    extract_pdf_chunks,
    extract_text_in_reading_order,
    generate_quiz_with_claude,
    get_claude_model,
    save_quiz_questions,
    select_quiz_chunks,
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


# =========================================================
# TEST extract_text_in_reading_order
# =========================================================

class FakePage:
    def __init__(self, blocks):
        self._blocks = blocks

    def get_text(self, kind):
        return self._blocks


def test_extract_text_in_reading_order_sorts_top_to_bottom():
    page = FakePage([
        (0, 50, 0, 0, "Second", 0, 0),
        (0, 10, 0, 0, "First", 0, 0),
    ])

    result = extract_text_in_reading_order(page)

    assert result == "First\n\nSecond"


def test_extract_text_in_reading_order_sorts_left_to_right_on_same_line():
    page = FakePage([
        (50, 10, 0, 0, "Right", 0, 0),
        (10, 10, 0, 0, "Left", 0, 0),
    ])

    result = extract_text_in_reading_order(page)

    assert result == "Left\n\nRight"


def test_extract_text_in_reading_order_skips_blank_blocks():
    page = FakePage([
        (0, 10, 0, 0, "Hello", 0, 0),
        (0, 20, 0, 0, "   ", 0, 0),
    ])

    result = extract_text_in_reading_order(page)

    assert result == "Hello"


def test_extract_text_in_reading_order_joins_with_double_newline():
    page = FakePage([
        (0, 10, 0, 0, "One", 0, 0),
        (0, 20, 0, 0, "Two", 0, 0),
        (0, 30, 0, 0, "Three", 0, 0),
    ])

    result = extract_text_in_reading_order(page)

    assert result == "One\n\nTwo\n\nThree"


def test_extract_text_in_reading_order_empty_blocks_returns_empty_string():
    page = FakePage([])

    result = extract_text_in_reading_order(page)

    assert result == ""


# =========================================================
# TEST get_claude_model
# =========================================================

def test_get_claude_model_returns_env_value(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "claude-3-opus-20240229")

    result = get_claude_model()

    assert result == "claude-3-opus-20240229"


def test_get_claude_model_raises_when_missing(monkeypatch):
    monkeypatch.delenv("CLAUDE_MODEL", raising=False)

    with pytest.raises(RuntimeError):
        get_claude_model()


def test_get_claude_model_raises_when_empty_string(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "")

    with pytest.raises(RuntimeError):
        get_claude_model()


# =========================================================
# TEST select_quiz_chunks
# =========================================================

def test_select_quiz_chunks_returns_all_when_total_less_than_max():
    chunks = ["a", "b", "c"]

    result = select_quiz_chunks(chunks, max_chunks=10)

    assert result == chunks


def test_select_quiz_chunks_returns_all_when_total_equals_max():
    chunks = ["a", "b", "c"]

    result = select_quiz_chunks(chunks, max_chunks=3)

    assert result == chunks


def test_select_quiz_chunks_returns_single_first_chunk_when_max_is_one():
    chunks = ["a", "b", "c", "d"]

    result = select_quiz_chunks(chunks, max_chunks=1)

    assert result == ["a"]


def test_select_quiz_chunks_distributed_selection_includes_first_and_last():
    chunks = list(range(10))

    result = select_quiz_chunks(chunks, max_chunks=3)

    assert result[0] == chunks[0]
    assert result[-1] == chunks[-1]


def test_select_quiz_chunks_result_length_matches_max_chunks():
    chunks = list(range(10))

    result = select_quiz_chunks(chunks, max_chunks=4)

    assert len(result) == 4


def test_select_quiz_chunks_raises_for_max_chunks_less_than_one():
    chunks = ["a", "b"]

    with pytest.raises(ValueError):
        select_quiz_chunks(chunks, max_chunks=0)


def test_select_quiz_chunks_uses_default_max_chunks_when_omitted():
    chunks = ["a", "b", "c"]

    result = select_quiz_chunks(chunks)

    assert result == chunks


# =========================================================
# TEST build_quiz_context
# =========================================================

def test_build_quiz_context_empty_list_returns_empty_string():
    result = build_quiz_context([])

    assert result == ""


def test_build_quiz_context_formats_single_chunk():
    chunk = SimpleNamespace(page_number=3, content="Hello world")

    result = build_quiz_context([chunk])

    assert result == "SOURCE 1\nPAGE: 3\n\nHello world"


def test_build_quiz_context_joins_multiple_chunks_with_separator():
    chunk_one = SimpleNamespace(page_number=1, content="First")
    chunk_two = SimpleNamespace(page_number=2, content="Second")

    result = build_quiz_context([chunk_one, chunk_two])

    assert result == (
        "SOURCE 1\nPAGE: 1\n\nFirst"
        "\n\n---\n\n"
        "SOURCE 2\nPAGE: 2\n\nSecond"
    )


def test_build_quiz_context_numbers_sources_sequentially():
    chunks = [
        SimpleNamespace(page_number=1, content="A"),
        SimpleNamespace(page_number=1, content="B"),
        SimpleNamespace(page_number=1, content="C"),
    ]

    result = build_quiz_context(chunks)

    assert "SOURCE 1" in result
    assert "SOURCE 2" in result
    assert "SOURCE 3" in result


# =========================================================
# TEST extract_pdf_chunks (partial - missing file only)
# =========================================================

def test_extract_pdf_chunks_raises_file_not_found_for_missing_file():
    with pytest.raises(FileNotFoundError):
        extract_pdf_chunks("nonexistent_file_12345.pdf")


# =========================================================
# TEST extract_page_text (mocked collaborators)
# =========================================================

def test_extract_page_text_uses_normal_extraction_when_ocr_not_meaningfully_longer():
    with patch(
        "ai.service.extract_text_in_reading_order",
        return_value="A" * 100,
    ), patch(
        "ai.service.extract_text_with_ocr",
        return_value="B" * 100,
    ):
        result = extract_page_text(object())

    assert result == "A" * 100


def test_extract_page_text_switches_to_ocr_when_meaningfully_longer():
    with patch(
        "ai.service.extract_text_in_reading_order",
        return_value="short",
    ), patch(
        "ai.service.extract_text_with_ocr",
        return_value="x" * 100,
    ):
        result = extract_page_text(object())

    assert result == "x" * 100


def test_extract_page_text_stays_on_normal_extraction_at_boundary():
    normal_text = "n" * 100

    with patch(
        "ai.service.extract_text_in_reading_order",
        return_value=normal_text,
    ), patch(
        "ai.service.extract_text_with_ocr",
        return_value="o" * 130,
    ):
        result = extract_page_text(object())

    assert result == normal_text


def test_extract_page_text_calls_both_extraction_functions_with_page():
    fake_page = object()

    with patch(
        "ai.service.extract_text_in_reading_order",
        return_value="a",
    ) as mock_normal, patch(
        "ai.service.extract_text_with_ocr",
        return_value="b",
    ) as mock_ocr:
        extract_page_text(fake_page)

    mock_normal.assert_called_once_with(fake_page)
    mock_ocr.assert_called_once_with(fake_page)


# =========================================================
# TEST generate_quiz_with_claude (mocked Anthropic client)
# =========================================================

def _mock_claude_response(text):
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)]
    )


def test_generate_quiz_with_claude_returns_parsed_questions_list():
    questions_json = json.dumps([
        {"question_text": "Q1", "question_type": "short_answer"}
    ])
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        questions_json
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        result = generate_quiz_with_claude(
            "Some context", question_count=1
        )

    assert result == [
        {"question_text": "Q1", "question_type": "short_answer"}
    ]


def test_generate_quiz_with_claude_strips_json_markdown_fence():
    questions_json = json.dumps([{"question_text": "Q1"}])
    fenced_text = f"```json\n{questions_json}\n```"
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        fenced_text
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        result = generate_quiz_with_claude("Some context")

    assert result == [{"question_text": "Q1"}]


def test_generate_quiz_with_claude_strips_plain_markdown_fence():
    questions_json = json.dumps([{"question_text": "Q1"}])
    fenced_text = f"```\n{questions_json}\n```"
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        fenced_text
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        result = generate_quiz_with_claude("Some context")

    assert result == [{"question_text": "Q1"}]


def test_generate_quiz_with_claude_raises_when_response_is_empty():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = SimpleNamespace(
        content=[]
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == "Claude returned an empty quiz."


def test_generate_quiz_with_claude_raises_on_invalid_json():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        "not valid json{"
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == (
        "Claude returned invalid JSON while generating the quiz."
    )


def test_generate_quiz_with_claude_raises_when_response_not_a_list():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        json.dumps({"question_text": "Q1"})
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == (
        "Claude quiz response must be a JSON array."
    )


def test_generate_quiz_with_claude_converts_rate_limit_error():
    fake_request = httpx.Request(
        "POST", "https://api.anthropic.com/v1/messages"
    )
    fake_response = httpx.Response(429, request=fake_request)
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = RateLimitError(
        "rate limited", response=fake_response, body=None
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == (
        "The AI service rate limit was reached. "
        "Please try again later."
    )


def test_generate_quiz_with_claude_converts_timeout_error():
    fake_request = httpx.Request(
        "POST", "https://api.anthropic.com/v1/messages"
    )
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = APITimeoutError(
        request=fake_request
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == (
        "The AI service took too long to respond."
    )


def test_generate_quiz_with_claude_converts_connection_error():
    fake_request = httpx.Request(
        "POST", "https://api.anthropic.com/v1/messages"
    )
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = APIConnectionError(
        request=fake_request
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert str(exc_info.value) == (
        "Could not connect to the AI service."
    )


def test_generate_quiz_with_claude_converts_api_status_error():
    fake_request = httpx.Request(
        "POST", "https://api.anthropic.com/v1/messages"
    )
    fake_response = httpx.Response(500, request=fake_request)
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = APIStatusError(
        "server error", response=fake_response, body=None
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        with pytest.raises(RuntimeError) as exc_info:
            generate_quiz_with_claude("Some context")

    assert "The AI service returned an error:" in str(exc_info.value)


def test_generate_quiz_with_claude_passes_context_and_count_into_prompt():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_claude_response(
        json.dumps([])
    )

    with patch(
        "ai.service.get_anthropic_client",
        return_value=mock_client,
    ), patch(
        "ai.service.get_claude_model",
        return_value="claude-test-model",
    ):
        generate_quiz_with_claude(
            "MY CONTEXT MARKER", question_count=7
        )

    call_kwargs = mock_client.messages.create.call_args.kwargs
    user_message = call_kwargs["messages"][0]["content"]

    assert call_kwargs["model"] == "claude-test-model"
    assert "MY CONTEXT MARKER" in user_message
    assert "7" in user_message


# =========================================================
# TEST save_quiz_questions (mocked db)
# =========================================================

def test_save_quiz_questions_saves_valid_multiple_choice_question():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [{
        "question_text": "What is 2+2?",
        "question_type": "multiple_choice",
        "options": {"A": "1", "B": "2", "C": "4", "D": "5"},
        "correct_answer": "c",
        "explanation": "Basic math",
        "source_page": 2,
    }]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert len(result) == 1
    assert result[0].question_type == "multiple_choice"
    assert result[0].correct_answer == "C"
    assert result[0].options == {
        "A": "1", "B": "2", "C": "4", "D": "5"
    }
    assert result[0].source_page == 2
    assert result[0].question_index == 0


def test_save_quiz_questions_saves_valid_true_false_question():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [{
        "question_text": "The sky is blue.",
        "question_type": "true_false",
        "correct_answer": "TRUE",
        "source_page": 1,
    }]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert result[0].correct_answer == "true"
    assert result[0].options == {"true": "True", "false": "False"}


def test_save_quiz_questions_saves_valid_short_answer_question():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [{
        "question_text": "Name the capital.",
        "question_type": "short_answer",
        "correct_answer": "  Paris  ",
    }]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert result[0].options is None
    assert result[0].correct_answer == "Paris"


def test_save_quiz_questions_skips_non_dict_items():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [
        "not a dict",
        {
            "question_text": "Q",
            "question_type": "short_answer",
            "correct_answer": "A",
        },
    ]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert len(result) == 1


def test_save_quiz_questions_skips_question_missing_question_text():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_type": "short_answer",
        "correct_answer": "A",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_question_missing_question_type():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "correct_answer": "A",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_question_missing_correct_answer():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "short_answer",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_multiple_choice_wrong_option_count():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "multiple_choice",
        "options": {"A": "1", "B": "2"},
        "correct_answer": "A",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_multiple_choice_wrong_option_keys():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "multiple_choice",
        "options": {"A": "1", "B": "2", "C": "3", "E": "4"},
        "correct_answer": "A",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_multiple_choice_invalid_correct_answer():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "multiple_choice",
        "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
        "correct_answer": "Z",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_true_false_invalid_correct_answer():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "true_false",
        "correct_answer": "maybe",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_short_answer_blank_correct_answer():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "short_answer",
        "correct_answer": "   ",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "multiple_choice",
        "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
        "correct_answer": "A",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_skips_unknown_question_type():
    quiz = SimpleNamespace(id="quiz-123")
    invalid = {
        "question_text": "Q",
        "question_type": "essay",
        "correct_answer": "A",
    }
    valid = {
        "question_text": "Valid",
        "question_type": "short_answer",
        "correct_answer": "B",
    }

    result = save_quiz_questions(MagicMock(), quiz, [invalid, valid])

    assert len(result) == 1
    assert result[0].question_text == "Valid"


def test_save_quiz_questions_normalizes_invalid_source_page_to_none():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [
        {
            "question_text": "Q1",
            "question_type": "short_answer",
            "correct_answer": "A",
            "source_page": "not-a-number",
        },
        {
            "question_text": "Q2",
            "question_type": "short_answer",
            "correct_answer": "B",
            "source_page": -5,
        },
    ]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert result[0].source_page is None
    assert result[1].source_page is None


def test_save_quiz_questions_question_index_increments_sequentially():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [
        {
            "question_text": f"Q{i}",
            "question_type": "short_answer",
            "correct_answer": "A",
        }
        for i in range(3)
    ]

    result = save_quiz_questions(MagicMock(), quiz, questions)

    assert [question.question_index for question in result] == [
        0, 1, 2
    ]


def test_save_quiz_questions_raises_when_no_valid_questions():
    quiz = SimpleNamespace(id="quiz-123")
    questions = [{
        "question_text": "",
        "question_type": "short_answer",
        "correct_answer": "A",
    }]

    with pytest.raises(RuntimeError):
        save_quiz_questions(MagicMock(), quiz, questions)


def test_save_quiz_questions_calls_db_commit_and_add():
    quiz = SimpleNamespace(id="quiz-123")
    mock_db = MagicMock()
    questions = [{
        "question_text": "Q",
        "question_type": "short_answer",
        "correct_answer": "A",
    }]

    save_quiz_questions(mock_db, quiz, questions)

    mock_db.commit.assert_called_once()
    mock_db.add.assert_called_once()