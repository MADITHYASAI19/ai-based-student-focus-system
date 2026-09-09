from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    DATABASE_URL: str = "sqlite:///./study_companion.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    CHROMA_URL: str = "http://localhost:8001"
    CHROMA_MODE: str = "embedded"
    JWT_SECRET_KEY: str = "development-only-change-me"
    AI_API_KEY: str = ""
    AI_API_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL_NAME: str = "openai/gpt-oss-120b"
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
