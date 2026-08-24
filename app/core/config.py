from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    DATABASE_URL: str
    REDIS_URL: str
    CHROMA_URL: str
    CHROMA_MODE: str = "embedded"
    JWT_SECRET_KEY: str
    AI_API_KEY: str
    LLM_MODEL_NAME: str = "openai/gpt-oss-120b"
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
