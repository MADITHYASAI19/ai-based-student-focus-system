"""
Quiz generation module — multi-type, key-rotating, deduplicated.

Supports: mcq, true_false, fill_blank, short_answer, coding.
Uses the existing key_manager for Groq API key rotation.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Sequence

from app.schemas.quiz import QuizQuestion, QuizOut, QUESTION_POINTS
from ai_service.generation.provider import complete_text
from ai_service.prompts.quiz_prompt import build_quiz_prompt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class QuizGenerationError(Exception):
    """Raised when quiz generation fails after all retry attempts."""
    pass


# ---------------------------------------------------------------------------
# Retry correction prompt
# ---------------------------------------------------------------------------
_RETRY_CORRECTION = (
    "Your last response was invalid JSON or did not match the required schema. "
    "Return ONLY the JSON array, no markdown fences, no commentary. "
    "Every object MUST have keys: id, question_text, type, options, correct_answer, explanation."
)


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------
_VALID_TYPES = {"mcq", "true_false", "fill_blank", "short_answer", "coding"}


def _validate_question(item: dict[str, Any], index: int) -> QuizQuestion:
    """Validate a single question dict and return a QuizQuestion.

    Raises ValueError with a descriptive message on any failure.
    """
    # Required fields
    for key in ("question_text", "type", "correct_answer"):
        if not item.get(key):
            raise ValueError(f"Question[{index}] missing required field '{key}'")

    qtype = item["type"]
    if qtype not in _VALID_TYPES:
        raise ValueError(f"Question[{index}] has unknown type '{qtype}'")

    # Type-specific rules
    if qtype == "mcq":
        opts = item.get("options")
        if not isinstance(opts, list) or len(opts) != 4:
            raise ValueError(f"Question[{index}] MCQ must have exactly 4 options, got {opts!r}")
        if len(set(opts)) != 4:
            raise ValueError(f"Question[{index}] MCQ options must be distinct")
        if item["correct_answer"] not in opts:
            raise ValueError(
                f"Question[{index}] correct_answer not in options: {item['correct_answer']!r}"
            )

    elif qtype == "true_false":
        if item.get("options") != ["True", "False"]:
            # Auto-fix: normalise
            item["options"] = ["True", "False"]
        if item["correct_answer"] not in ("True", "False"):
            raise ValueError(
                f"Question[{index}] true_false correct_answer must be 'True' or 'False'"
            )

    elif qtype == "fill_blank":
        if "______" not in item["question_text"]:
            raise ValueError(
                f"Question[{index}] fill_blank question must contain '______'"
            )

    # Ensure id is a string
    if not item.get("id"):
        item["id"] = f"q{index + 1}"
    item["id"] = str(item["id"])

    # Ensure points
    if not item.get("points"):
        item["points"] = QUESTION_POINTS.get(qtype, 1.0)

    return QuizQuestion.model_validate(item)


def _parse_questions(raw: str) -> list[QuizQuestion]:
    """Parse and validate raw LLM JSON output into QuizQuestion list."""
    # Strip markdown fences if model disobeys the prompt
    stripped = raw.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        stripped = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    data: Any = json.loads(stripped)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array, got {type(data).__name__}")

    questions: list[QuizQuestion] = []
    for i, item in enumerate(data):
        questions.append(_validate_question(item, i))
    return questions


# ---------------------------------------------------------------------------
# Question deduplication (hash-based)
# ---------------------------------------------------------------------------

def _question_hash(q: QuizQuestion) -> str:
    """Return a short hash of the question text (for deduplication)."""
    normalized = q.question_text.strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Cache key convention
# ---------------------------------------------------------------------------

def make_cache_key(
    topic_id: int,
    difficulty: str,
    question_types: Sequence[str] | None = None,
    n_questions: int = 5,
) -> str:
    """Return the canonical cache key for a quiz result."""
    types_str = ",".join(sorted(question_types or ["mcq"]))
    return f"quiz:{topic_id}:{difficulty}:{types_str}:{n_questions}"


# ---------------------------------------------------------------------------
# Core generation function
# ---------------------------------------------------------------------------

def generate_quiz(
    topic: str,
    difficulty: str,
    n_questions: int = 5,
    question_types: Sequence[str] | None = None,
    pdf_context: str | None = None,
    pdf_source_mode: str | None = None,
) -> list[QuizQuestion]:
    """Generate quiz questions via the LLM with one JSON-parse retry.

    Args:
        topic: Human-readable topic label (e.g. "Binary Trees").
        difficulty: One of 'easy' | 'medium' | 'hard' | 'mixed'.
        n_questions: Desired number of questions (1-30).
        question_types: List of types to include. Defaults to ["mcq"].
        pdf_context: Optional PDF content to ground questions in.
        pdf_source_mode: "topic_knowledge", "pdf_only", or "topic_pdf".

    Returns:
        A validated list of QuizQuestion objects.

    Raises:
        QuizGenerationError: If generation/parsing fails after 2 attempts.
    """
    if question_types is None:
        question_types = ["mcq"]

    messages = build_quiz_prompt(
        topic=topic,
        difficulty=difficulty,
        n_questions=n_questions,
        question_types=question_types,
        pdf_context=pdf_context,
        pdf_source_mode=pdf_source_mode,
    )

    # Attempt 1 — complete_text uses rotating key manager internally
    logger.info(
        "generate_quiz: topic=%s difficulty=%s types=%s n=%s",
        topic, difficulty, question_types, n_questions,
    )
    raw = complete_text(messages)
    logger.debug("generate_quiz attempt 1 raw: %s", raw[:400])

    try:
        return _parse_questions(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("generate_quiz attempt 1 failed (%s) — retrying", exc)

    # Attempt 2 with correction
    retry_messages = messages + [
        {"role": "assistant", "content": raw},
        {"role": "user", "content": _RETRY_CORRECTION},
    ]
    raw2 = complete_text(retry_messages)
    logger.debug("generate_quiz attempt 2 raw: %s", raw2[:400])

    try:
        return _parse_questions(raw2)
    except (json.JSONDecodeError, ValueError) as exc:
        error_msg = (
            f"generate_quiz failed after 2 attempts for topic='{topic}' "
            f"difficulty='{difficulty}' types={question_types}: {exc}"
        )
        logger.error(error_msg)
        raise QuizGenerationError(error_msg) from exc


# ---------------------------------------------------------------------------
# Serialisation helpers — used by the caching layer
# ---------------------------------------------------------------------------

def serialise_quiz(quiz: QuizOut) -> str:
    """Serialise a QuizOut to a JSON string for cache storage."""
    return quiz.model_dump_json()


def deserialise_quiz(raw: str) -> QuizOut:
    """Deserialise a JSON string back into a QuizOut instance."""
    try:
        data: dict[str, Any] = json.loads(raw)
        return QuizOut.model_validate(data)
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Failed to deserialise quiz from cache: %s", exc)
        raise ValueError(f"Invalid cached quiz payload: {exc}") from exc
