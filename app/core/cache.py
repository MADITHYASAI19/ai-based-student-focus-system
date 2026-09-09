import logging
from typing import Generator, Optional
import cachetools
import redis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_in_process_cache = cachetools.TTLCache(maxsize=1000, ttl=3600)
_use_in_process = False

try:
    redis_client = redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=1.0,
    )
    redis_client.ping()
except Exception:
    _use_in_process = True
    logger.warning(
        "Redis unavailable, using in-process cache — caching will not persist across restarts or scale across workers"
    )


def get_cache() -> Generator[Optional[redis.Redis], None, None]:
    """FastAPI dependency provider for Redis client."""
    yield None if _use_in_process else redis_client


def cache_get(key: str, client: Optional[redis.Redis] = None) -> Optional[str]:
    """Retrieve a string value from Redis or fallback in-process cache by key."""
    if _use_in_process:
        return _in_process_cache.get(key)

    r = client or redis_client
    try:
        return r.get(key)
    except Exception as e:
        logger.warning(f"Redis cache_get failed for key '{key}': {e}")
        return _in_process_cache.get(key)


def cache_set(
    key: str,
    value: str,
    ttl_seconds: int = 3600,
    client: Optional[redis.Redis] = None,
) -> bool:
    """Set a string value in Redis or fallback in-process cache with expiration TTL."""
    # Always write to in-process cache for resilience
    _in_process_cache[key] = value

    if _use_in_process:
        return True

    r = client or redis_client
    try:
        return bool(r.set(key, value, ex=ttl_seconds))
    except Exception as e:
        logger.warning(f"Redis cache_set failed for key '{key}': {e}")
        return True

