"""Replaceable OpenAI-compatible AI provider for Grok/Groq and local testing."""

from typing import Optional
from openai import OpenAI

from app.core.config import get_settings
from ai_service.generation.key_manager import GroqKeyManager

# Initialize the key manager as a singleton
_key_manager = GroqKeyManager()

def get_ai_client() -> OpenAI:
    """
    Returns an OpenAI client using the current rotated API key.
    Note: Since keys rotate, we no longer cache the client instance.
    """
    settings = get_settings()
    api_key = _key_manager.get_key()
    return OpenAI(api_key=api_key, base_url=settings.AI_API_BASE_URL, timeout=45.0)


def complete_json(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    # Attempt the call with rotation and failover
    max_retries = len(_key_manager.keys) or 1
    for attempt in range(max_retries):
        try:
            client = get_ai_client()
            # We need the key used for this specific client to report failure
            current_key = _key_manager.keys[_key_manager.current_index - 1] if _key_manager.current_index > 0 else _key_manager.keys[-1]

            response = client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
                timeout=45.0,
            )
            return response.choices[0].message.content or "{}"
        except Exception as e:
            # Check if it's a rate limit error (typically 429)
            is_rate_limit = "429" in str(e)
            _key_manager.report_failure(current_key, is_rate_limit=is_rate_limit)
            if attempt == max_retries - 1:
                raise e

    return "{}"


def complete_text(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    max_retries = len(_key_manager.keys) or 1
    for attempt in range(max_retries):
        try:
            client = get_ai_client()
            current_key = _key_manager.keys[_key_manager.current_index - 1] if _key_manager.current_index > 0 else _key_manager.keys[-1]

            response = client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=messages,
                temperature=0.3,
                timeout=45.0,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            is_rate_limit = "429" in str(e)
            _key_manager.report_failure(current_key, is_rate_limit=is_rate_limit)
            if attempt == max_retries - 1:
                raise e

    return ""
