"""Unit tests for build_quiz_prompt — no LLM calls, pure structural checks."""

import json
import pytest
from ai_service.prompts.quiz_prompt import build_quiz_prompt, _TYPE_EXAMPLES


# ---------------------------------------------------------------------------
# Worked example validity
# ---------------------------------------------------------------------------

def test_example_output_is_valid_json():
    """Type examples must all be valid dicts."""
    for qtype, example in _TYPE_EXAMPLES.items():
        assert isinstance(example, dict)
        assert "question_text" in example
        assert "type" in example


def test_example_output_matches_expected_shape():
    """Every MCQ example must have 4 options with correct_answer in options."""
    mcq = _TYPE_EXAMPLES.get("mcq", {})
    assert mcq.get("type") == "mcq"
    assert isinstance(mcq.get("options"), list)
    assert len(mcq["options"]) == 4
    assert mcq["correct_answer"] in mcq["options"]

    sa = _TYPE_EXAMPLES.get("short_answer", {})
    assert sa.get("options") is None


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
    """A worked example must be embedded in the user message."""
    messages = build_quiz_prompt("Graphs", "easy")
    # The user message should contain the example JSON
    assert "question_text" in messages[1]["content"]
    assert "correct_answer" in messages[1]["content"]


# ---------------------------------------------------------------------------
# Distribution logic
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("n,expected_mcq,expected_short", [
    (5, 4, 1),
    (4, 3, 1),
    (3, 3, 0),
    (1, 1, 0),
])
def test_question_type_ratio_in_user_message(n, expected_mcq, expected_short):
    """Default question types are mcq + short_answer split."""
    messages = build_quiz_prompt(
        "Hashing", "medium", n_questions=n,
        question_types=["mcq", "short_answer"] if n >= 4 else ["mcq"],
    )
    user_msg = messages[1]["content"]
    assert str(expected_mcq) in user_msg


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
# All four difficulty levels produce non-empty prompts
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_all_difficulties_produce_output(difficulty):
    messages = build_quiz_prompt("Dynamic Programming", difficulty)
    assert messages[0]["content"]
    assert messages[1]["content"]
