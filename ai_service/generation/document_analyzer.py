"""LLM analysis for uploaded topic study documents."""

import json
import logging
import os
from functools import lru_cache

from dotenv import load_dotenv
from openai import OpenAI

from ai_service.config import get_model_name

logger = logging.getLogger(__name__)
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"


@lru_cache(maxsize=1)
def _get_client() -> OpenAI:
    load_dotenv()
    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise ValueError("AI_API_KEY environment variable is not set")
    return OpenAI(api_key=api_key, base_url=_GROQ_BASE_URL, timeout=30.0)


def analyze_document(content: str, topic_name: str) -> dict:
    """Return structured concepts, difficulty, reason, and study hours."""
    if not content.strip():
        raise ValueError("The uploaded document contains no readable text")

    return _analyze(topic_name, content)


def estimate_topic(topic_name: str, content: str = "") -> dict:
    """Estimate topic difficulty and study time before a plan is confirmed."""
    if not topic_name.strip():
        raise ValueError("Topic name cannot be empty")
    return _analyze(topic_name, content or "No study document has been uploaded yet. Estimate from the topic name and typical scope.")


def _analyze(topic_name: str, content: str) -> dict:
    prompt = f"""Analyze the study topic: {topic_name}.
Return ONLY valid JSON with this exact shape:
{{
  "concepts": ["specific concept or subtopic"],
  "difficulty": "easy|medium|hard",
  "difficulty_reason": "one short reason",
  "estimated_hours": 2.5
}}

Identify concepts covered in the supplied material when available. Estimate hours to fully study and complete the topic based on its scope, material length, and difficulty.

DOCUMENT:
{content[:120000]}"""
    response = _get_client().chat.completions.create(
        model=get_model_name(),
        messages=[
            {"role": "system", "content": "You are a precise academic curriculum analyst."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
        timeout=30.0,
    )
    raw = response.choices[0].message.content or ""
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Document analysis returned invalid JSON: %s", raw[:500])
        raise ValueError("The document analysis response was not valid JSON") from exc

    concepts = result.get("concepts")
    difficulty = result.get("difficulty")
    reason = result.get("difficulty_reason")
    hours = result.get("estimated_hours")
    if not isinstance(concepts, list) or not all(isinstance(item, str) for item in concepts):
        raise ValueError("Document analysis returned invalid concepts")
    if difficulty not in {"easy", "medium", "hard"} or not isinstance(reason, str):
        raise ValueError("Document analysis returned invalid difficulty")
    try:
        estimated_hours = max(0.25, float(hours))
    except (TypeError, ValueError) as exc:
        raise ValueError("Document analysis returned invalid study hours") from exc

    return {
        "concepts": concepts[:30],
        "difficulty": difficulty,
        "difficulty_reason": reason[:500],
        "estimated_hours": round(estimated_hours, 2),
    }
