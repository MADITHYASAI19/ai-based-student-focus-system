"""
Quiz generation module for AI Study Companion.

Imports QuizQuestion and QuizOut directly from app.schemas.quiz as the
single source of truth for the quiz data contract.  This is intentional:
app.schemas.quiz is a pure-Pydantic file with no FastAPI or SQLAlchemy
imports, so importing it here introduces no circular dependency and keeps
both sides in sync automatically.
"""

import json
import logging
import os
from typing import Any
from functools import lru_cache

from dotenv import load_dotenv
from openai import OpenAI

# Single source of truth — do NOT redefine these locally.
from app.schemas.quiz import QuizOut, QuizQuestion
from ai_service.prompts.quiz_prompt import build_quiz_prompt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom exception for quiz generation failures
# ---------------------------------------------------------------------------

class QuizGenerationError(Exception):
    """Raised when quiz generation fails after all retry attempts."""
    pass

# ---------------------------------------------------------------------------
# LLM client — Groq's OpenAI-compatible endpoint, key from environment
# ---------------------------------------------------------------------------

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_CHAT_MODEL = "llama-3.3-70b-versatile"

_RETRY_CORRECTION = (
    "Your last response was invalid JSON. "
    "Return ONLY the JSON array, no markdown fences, no commentary."
)


@lru_cache(maxsize=1)
def _get_client() -> OpenAI:
    """Instantiate and cache the OpenAI-compatible Groq client."""
    load_dotenv()
    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise ValueError("AI_API_KEY environment variable is not set")
    return OpenAI(api_key=api_key, base_url=_GROQ_BASE_URL, timeout=20.0)


def _call_llm(client: OpenAI, messages: list[dict[str, str]]) -> str:
    """Send messages to the LLM and return the raw response text."""
    load_dotenv()
    response = client.chat.completions.create(
        model=_CHAT_MODEL,
        messages=messages,  # type: ignore[arg-type]
        temperature=0.3,
        timeout=20.0,
    )
    return response.choices[0].message.content or ""


def _parse_questions(raw: str) -> list[QuizQuestion]:
    """Parse the LLM's raw JSON string into validated QuizQuestion objects.

    Raises:
        json.JSONDecodeError: If ``raw`` is not valid JSON.
        ValueError: If the parsed structure doesn't match QuizQuestion schema.
    """
    data: Any = json.loads(raw.strip())
    if not isinstance(data, list):
        raise ValueError(
            f"Expected a JSON array from the LLM, got {type(data).__name__}"
        )
    questions: list[QuizQuestion] = []
    for i, item in enumerate(data):
        try:
            questions.append(QuizQuestion.model_validate(item))
        except Exception as exc:
            raise ValueError(
                f"Question at index {i} failed schema validation: {exc}"
            ) from exc
    return questions


# ---------------------------------------------------------------------------
# Public cache-key convention (shared with the quizzes router)
# ---------------------------------------------------------------------------

def make_cache_key(topic_id: int, difficulty: str) -> str:
    """Return the canonical Redis cache key for a quiz result."""
    return f"quiz:{topic_id}:{difficulty}"


# ---------------------------------------------------------------------------
# Core generation function
# ---------------------------------------------------------------------------

def generate_quiz(
    topic: str,
    difficulty: str,
    n_questions: int = 5,
) -> list[QuizQuestion]:
    """Generate quiz questions via the LLM with one JSON-parse retry.

    Args:
        topic: Human-readable topic label (e.g. "Binary Trees").
        difficulty: One of 'easy' | 'medium' | 'hard'.
        n_questions: Desired number of questions (default 5).

    Returns:
        A validated list of QuizQuestion objects.

    Raises:
        QuizGenerationError: If the LLM response cannot be parsed after two attempts,
                             or if schema validation fails.
    """
    client = _get_client()
    messages = build_quiz_prompt(topic=topic, difficulty=difficulty, n_questions=n_questions)

    # --- Attempt 1 ---
    logger.info("generate_quiz: attempt 1 — topic=%s difficulty=%s n=%s", topic, difficulty, n_questions)
    raw = _call_llm(client, messages)
    logger.debug("generate_quiz: LLM response (attempt 1): %s", raw[:300])

    try:
        return _parse_questions(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "generate_quiz: attempt 1 parse failed (%s) — retrying with correction prompt",
            exc,
        )

    # --- Attempt 2: append correction message ---
    retry_messages = messages + [
        {"role": "assistant", "content": raw},
        {"role": "user", "content": _RETRY_CORRECTION},
    ]
    logger.info("generate_quiz: attempt 2 — sending correction prompt")
    raw2 = _call_llm(client, retry_messages)
    logger.debug("generate_quiz: LLM response (attempt 2): %s", raw2[:300])

    try:
        return _parse_questions(raw2)
    except (json.JSONDecodeError, ValueError) as exc:
        error_msg = (
            f"generate_quiz failed after 2 attempts for topic='{topic}' "
            f"difficulty='{difficulty}': {exc}"
        )
        logger.error(error_msg)
        raise QuizGenerationError(error_msg) from exc


# ---------------------------------------------------------------------------
# Serialisation helpers — used by the caching layer
# ---------------------------------------------------------------------------

def serialise_quiz(quiz: QuizOut) -> str:
    """Serialise a QuizOut to a JSON string for Redis storage."""
    return quiz.model_dump_json()


def deserialise_quiz(raw: str) -> QuizOut:
    """Deserialise a JSON string from Redis back into a QuizOut instance.

    Raises:
        ValueError: If the raw string cannot be parsed or fails schema validation.
    """
    try:
        data: dict[str, Any] = json.loads(raw)
        return QuizOut.model_validate(data)
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Failed to deserialise quiz from cache: %s", exc)
        raise ValueError(f"Invalid cached quiz payload: {exc}") from exc
