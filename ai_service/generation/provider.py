"""Replaceable OpenAI-compatible AI provider for Grok/Groq and local testing."""

from typing import Optional
from openai import OpenAI

from app.core.config import get_settings
from ai_service.generation.key_manager import GroqKeyManager

# Initialize the key manager as a singleton
_key_manager = GroqKeyManager()

def get_ai_client_with_key() -> tuple[OpenAI, str]:
    """
    Returns an OpenAI client along with the specific API key used.
    """
    settings = get_settings()
    api_key = _key_manager.get_key()
    client = OpenAI(api_key=api_key, base_url=settings.AI_API_BASE_URL, timeout=45.0)
    return client, api_key


def get_ai_client() -> OpenAI:
    """
    Returns an OpenAI client using the current rotated API key.
    """
    client, _ = get_ai_client_with_key()
    return client


def complete_json(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    max_retries = max(len(_key_manager.keys), 1)
    last_error: Optional[Exception] = None

    for attempt in range(max_retries):
        current_key: Optional[str] = None
        try:
            client, current_key = get_ai_client_with_key()
            response = client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
                timeout=45.0,
            )
            return response.choices[0].message.content or "{}"
        except Exception as e:
            last_error = e
            if current_key:
                is_rate_limit = "429" in str(e)
                _key_manager.report_failure(current_key, is_rate_limit=is_rate_limit)
            if attempt == max_retries - 1:
                raise last_error

    if last_error:
        raise last_error
    return "{}"


def complete_text(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    max_retries = max(len(_key_manager.keys), 1)
    last_error: Optional[Exception] = None

    for attempt in range(max_retries):
        current_key: Optional[str] = None
        try:
            client, current_key = get_ai_client_with_key()
            response = client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=messages,
                temperature=0.3,
                timeout=45.0,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            last_error = e
            if current_key:
                is_rate_limit = "429" in str(e)
                _key_manager.report_failure(current_key, is_rate_limit=is_rate_limit)
            if attempt == max_retries - 1:
                raise last_error

    if last_error:
        raise last_error
    return ""
