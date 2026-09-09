"""Replaceable OpenAI-compatible AI provider for Grok/Groq and local testing."""

from functools import lru_cache

from openai import OpenAI

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_ai_client() -> OpenAI:
    settings = get_settings()
    api_key = settings.AI_API_KEY
    if not api_key:
        raise ValueError("AI_API_KEY environment variable is not set")
    return OpenAI(api_key=api_key, base_url=settings.AI_API_BASE_URL, timeout=45.0)


def complete_json(messages: list[dict[str, str]]) -> str:
    response = get_ai_client().chat.completions.create(
        model=get_settings().LLM_MODEL_NAME,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
        timeout=45.0,
    )
    return response.choices[0].message.content or "{}"


def complete_text(messages: list[dict[str, str]]) -> str:
    response = get_ai_client().chat.completions.create(
        model=get_settings().LLM_MODEL_NAME,
        messages=messages,
        temperature=0.3,
        timeout=45.0,
    )
    return response.choices[0].message.content or ""
