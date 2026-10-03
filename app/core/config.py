from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    DATABASE_URL: str = "sqlite:///./study_companion.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    CHROMA_URL: str = "http://localhost:8001"
    CHROMA_MODE: str = "embedded"
    JWT_SECRET_KEY: str | None = None
    AI_API_KEY: str | None = None
    AI_API_KEYS: list[str] = []
    AI_API_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL_NAME: str = "openai/gpt-oss-120b"
    FRONTEND_URL: str = "http://localhost:5173"
    TRACKER_EMAIL: str | None = None
    TRACKER_PASSWORD: str | None = None
    TRACKER_API_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    @model_validator(mode="after")
    def normalize_settings(self) -> "Settings":
        if self.AI_API_KEY:
            self.AI_API_KEY = self.AI_API_KEY.strip()
        if self.LLM_MODEL_NAME:
            self.LLM_MODEL_NAME = self.LLM_MODEL_NAME.strip()
        if self.AI_API_BASE_URL:
            self.AI_API_BASE_URL = self.AI_API_BASE_URL.strip()

        # If AI_API_KEYS is empty and AI_API_KEY is present, populate AI_API_KEYS
        if not self.AI_API_KEYS and self.AI_API_KEY:
            self.AI_API_KEYS = [self.AI_API_KEY]
        elif self.AI_API_KEYS:
            self.AI_API_KEYS = [k.strip() for k in self.AI_API_KEYS if k and k.strip()]
        return self


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

