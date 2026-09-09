"""Replaceable OpenAI-compatible AI provider for Grok/Groq and local testing."""

import os
from functools import lru_cache

from dotenv import load_dotenv
from openai import OpenAI

from ai_service.config import get_model_name


@lru_cache(maxsize=1)
def get_ai_client() -> OpenAI:
    load_dotenv()
    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise ValueError("AI_API_KEY environment variable is not set")
    base_url = os.getenv("AI_API_BASE_URL", "https://api.groq.com/openai/v1")
    return OpenAI(api_key=api_key, base_url=base_url, timeout=45.0)


def complete_json(messages: list[dict[str, str]]) -> str:
    response = get_ai_client().chat.completions.create(
        model=get_model_name(),
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
        timeout=45.0,
    )
    return response.choices[0].message.content or "{}"


def complete_text(messages: list[dict[str, str]]) -> str:
    response = get_ai_client().chat.completions.create(
        model=get_model_name(),
        messages=messages,
        temperature=0.3,
        timeout=45.0,
    )
    return response.choices[0].message.content or ""
