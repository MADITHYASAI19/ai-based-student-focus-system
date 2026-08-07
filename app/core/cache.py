import logging
from typing import Generator, Optional

import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_cache() -> Generator[redis.Redis, None, None]:
    """FastAPI dependency provider for Redis client."""
    yield redis_client


def cache_get(key: str, client: Optional[redis.Redis] = None) -> Optional[str]:
    """Retrieve a string value from Redis cache by key."""
    r = client or redis_client
    try:
        return r.get(key)
    except Exception as e:
        logger.warning(f"Redis cache_get failed for key '{key}': {e}")
        return None


def cache_set(
    key: str,
    value: str,
    ttl_seconds: int = 3600,
    client: Optional[redis.Redis] = None,
) -> bool:
    """Set a string value in Redis cache with expiration TTL (in seconds)."""
    r = client or redis_client
    try:
        return bool(r.set(key, value, ex=ttl_seconds))
    except Exception as e:
        logger.warning(f"Redis cache_set failed for key '{key}': {e}")
        return False
