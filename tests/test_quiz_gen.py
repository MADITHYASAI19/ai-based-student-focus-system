"""Unit tests for generate_quiz — all LLM calls are mocked."""

import json
from unittest.mock import MagicMock, patch

import pytest

from ai_service.generation.quiz_gen import (
    _RETRY_CORRECTION,
    _call_llm,
    _parse_questions,
    generate_quiz,
    make_cache_key,
)
from app.schemas.quiz import QuizQuestion


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VALID_MCQ = {
    "question_text": "What is the time complexity of binary search?",
    "type": "mcq",
    "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    "correct_answer": "O(log n)",
}

VALID_SA = {
    "question_text": "Explain what a hash collision is.",
    "type": "short_answer",
    "options": None,
    "correct_answer": "A hash collision occurs when two different keys produce the same hash value.",
}

VALID_JSON = json.dumps([VALID_MCQ, VALID_SA])


def _make_completion(content: str):
    """Build a minimal mock of an OpenAI ChatCompletion response."""
    choice = MagicMock()
    choice.message.content = content
    completion = MagicMock()
    completion.choices = [choice]
    return completion


# ---------------------------------------------------------------------------
# _parse_questions unit tests
# ---------------------------------------------------------------------------

def test_parse_questions_valid_mcq_and_short_answer():
    questions = _parse_questions(VALID_JSON)
    assert len(questions) == 2
    assert isinstance(questions[0], QuizQuestion)
    assert questions[0].type == "mcq"
    assert questions[1].type == "short_answer"
    assert questions[1].options is None


def test_parse_questions_raises_on_invalid_json():
    with pytest.raises(json.JSONDecodeError):
        _parse_questions("not json at all ```")


def test_parse_questions_raises_when_root_is_not_list():
    with pytest.raises(ValueError, match="Expected a JSON array"):
        _parse_questions(json.dumps({"question_text": "oops"}))


def test_parse_questions_raises_on_schema_violation():
    bad = [{"question_text": "Missing type field", "options": None, "correct_answer": "x"}]
    with pytest.raises(ValueError, match="schema validation"):
        _parse_questions(json.dumps(bad))


def test_parse_questions_strips_whitespace_and_newlines():
    padded = f"\n\n{VALID_JSON}\n\n"
    questions = _parse_questions(padded)
    assert len(questions) == 2


# ---------------------------------------------------------------------------
# generate_quiz — success on first attempt
# ---------------------------------------------------------------------------

@patch("ai_service.generation.quiz_gen._get_client")
def test_generate_quiz_success_first_attempt(mock_get_client):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _make_completion(VALID_JSON)
    mock_get_client.return_value = mock_client

    result = generate_quiz("Binary Search", "medium", n_questions=2)

    assert len(result) == 2
    assert all(isinstance(q, QuizQuestion) for q in result)
    # LLM should have been called exactly once
    assert mock_client.chat.completions.create.call_count == 1


# ---------------------------------------------------------------------------
# generate_quiz — retry on first JSONDecodeError, success on second attempt
# ---------------------------------------------------------------------------

@patch("ai_service.generation.quiz_gen._get_client")
def test_generate_quiz_retries_on_json_decode_error(mock_get_client):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [
        _make_completion("```json\nnot valid```"),  # attempt 1 — bad JSON
        _make_completion(VALID_JSON),              # attempt 2 — valid
    ]
    mock_get_client.return_value = mock_client

    result = generate_quiz("Stacks", "easy", n_questions=2)

    assert len(result) == 2
    assert mock_client.chat.completions.create.call_count == 2

    # Verify the correction message was appended in the second call
    second_call_messages = mock_client.chat.completions.create.call_args_list[1][1]["messages"]
    assert any(m["content"] == _RETRY_CORRECTION for m in second_call_messages)


# ---------------------------------------------------------------------------
# generate_quiz — raises ValueError after two failures
# ---------------------------------------------------------------------------

@patch("ai_service.generation.quiz_gen._get_client")
def test_generate_quiz_raises_after_two_failures(mock_get_client):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [
        _make_completion("bad JSON #1"),
        _make_completion("bad JSON #2"),
    ]
    mock_get_client.return_value = mock_client

    with pytest.raises(ValueError, match="failed after 2 attempts"):
        generate_quiz("Queues", "hard", n_questions=3)

    assert mock_client.chat.completions.create.call_count == 2


# ---------------------------------------------------------------------------
# generate_quiz — retry on schema validation failure (not just JSONDecodeError)
# ---------------------------------------------------------------------------

@patch("ai_service.generation.quiz_gen._get_client")
def test_generate_quiz_retries_on_schema_validation_failure(mock_get_client):
    bad_schema_json = json.dumps([{"question_text": "No type field", "options": None, "correct_answer": "x"}])
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = [
        _make_completion(bad_schema_json),  # attempt 1 — passes JSON parse but fails Pydantic
        _make_completion(VALID_JSON),       # attempt 2 — valid
    ]
    mock_get_client.return_value = mock_client

    result = generate_quiz("Graphs", "medium", n_questions=2)
    assert len(result) == 2
    assert mock_client.chat.completions.create.call_count == 2


# ---------------------------------------------------------------------------
# make_cache_key
# ---------------------------------------------------------------------------

def test_make_cache_key_format():
    assert make_cache_key(7, "hard") == "quiz:7:hard"
    assert make_cache_key(1, "easy") == "quiz:1:easy"
