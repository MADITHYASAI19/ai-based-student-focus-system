from app.core.config import get_settings

DEFAULT_MODEL_NAME = "openai/gpt-oss-120b"


def get_model_name() -> str:
    """Return the configured model name from the central settings object."""
    return get_settings().LLM_MODEL_NAME
