import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL_NAME = "openai/gpt-oss-120b"


def get_model_name() -> str:
    """Return the LLM model name from LLM_MODEL_NAME env var, defaulting to openai/gpt-oss-120b."""
    load_dotenv()
    return os.getenv("LLM_MODEL_NAME", DEFAULT_MODEL_NAME)
