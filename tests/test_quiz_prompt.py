"""Unit tests for build_quiz_prompt — no LLM calls, pure structural checks."""

import json
import pytest
from ai_service.prompts.quiz_prompt import build_quiz_prompt, _EXAMPLE_OUTPUT


# ---------------------------------------------------------------------------
# Worked example validity
# ---------------------------------------------------------------------------

def test_example_output_is_valid_json():
    """The embedded example must be parseable as JSON."""
    parsed = json.loads(_EXAMPLE_OUTPUT)
    assert isinstance(parsed, list)
    assert len(parsed) > 0


def test_example_output_matches_expected_shape():
    """Every item in the worked example must have the four required keys."""
    for item in json.loads(_EXAMPLE_OUTPUT):
        assert "question_text" in item
        assert "type" in item
        assert item["type"] in ("mcq", "short_answer")
        assert "options" in item
        assert "correct_answer" in item

    # MCQ items must have 4 string options; short_answer must have null options
    for item in json.loads(_EXAMPLE_OUTPUT):
        if item["type"] == "mcq":
            assert isinstance(item["options"], list)
            assert len(item["options"]) == 4
            assert item["correct_answer"] in item["options"]
        else:
            assert item["options"] is None


# ---------------------------------------------------------------------------
# Return-value structure
# ---------------------------------------------------------------------------

def test_returns_two_message_dicts():
    """build_quiz_prompt must return exactly [system, user] messages."""
    messages = build_quiz_prompt("Binary Trees", "medium")
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert isinstance(messages[0]["content"], str)
    assert isinstance(messages[1]["content"], str)


def test_topic_appears_in_user_message():
    """The user message must mention the requested topic."""
    messages = build_quiz_prompt("Recursion", "easy", n_questions=3)
    assert "Recursion" in messages[1]["content"]


def test_difficulty_appears_in_user_message():
    messages = build_quiz_prompt("Sorting Algorithms", "hard")
    assert "HARD" in messages[1]["content"]


def test_n_questions_appears_in_user_message():
    messages = build_quiz_prompt("Linked Lists", "medium", n_questions=7)
    assert "7" in messages[1]["content"]


def test_example_json_block_is_in_user_message():
    """The worked example JSON must be embedded in the user message."""
    messages = build_quiz_prompt("Graphs", "easy")
    assert _EXAMPLE_OUTPUT in messages[1]["content"]


# ---------------------------------------------------------------------------
# MCQ / short_answer ratio logic
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("n,expected_mcq,expected_short", [
    (5, 4, 1),
    (4, 3, 1),
    (3, 3, 0),
    (1, 1, 0),
])
def test_question_type_ratio_in_user_message(n, expected_mcq, expected_short):
    messages = build_quiz_prompt("Hashing", "medium", n_questions=n)
    user_msg = messages[1]["content"]
    assert f'{expected_mcq} question' in user_msg
    assert f'{expected_short} question' in user_msg


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_empty_topic_raises():
    with pytest.raises(ValueError, match="topic"):
        build_quiz_prompt("   ", "easy")


def test_invalid_difficulty_raises():
    with pytest.raises(ValueError, match="difficulty"):
        build_quiz_prompt("Stacks", "extreme")


def test_zero_questions_raises():
    with pytest.raises(ValueError, match="n_questions"):
        build_quiz_prompt("Queues", "medium", n_questions=0)


def test_negative_questions_raises():
    with pytest.raises(ValueError, match="n_questions"):
        build_quiz_prompt("Queues", "medium", n_questions=-2)


# ---------------------------------------------------------------------------
# All three difficulty levels produce non-empty prompts
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_all_difficulties_produce_output(difficulty):
    messages = build_quiz_prompt("Dynamic Programming", difficulty)
    assert messages[0]["content"]
    assert messages[1]["content"]
