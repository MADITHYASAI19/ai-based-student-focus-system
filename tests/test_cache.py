from unittest.mock import MagicMock, patch
import app.core.cache as cache_module
from app.core.cache import cache_get, cache_set, get_cache


def test_get_cache_dependency():
    """Verify get_cache yields a Redis client when connected, or None when using in-process fallback."""
    gen = get_cache()
    client = next(gen)
    # Accept either a real Redis client (when Redis is running) or None (in-process fallback).
    # The important thing is that get_cache is a working generator.
    import redis
    assert client is None or isinstance(client, redis.Redis)


def test_cache_get_and_set_with_mock():
    """Verify cache_set and cache_get helpers using a mock Redis client."""
    mock_redis = MagicMock()
    mock_redis.get.return_value = '{"test": "data"}'
    mock_redis.set.return_value = True

    # Force Redis path (bypass in-process fallback) so the mock client is exercised.
    with patch.object(cache_module, "_use_in_process", False):
        # Test set
        success = cache_set("quiz:1:medium", '{"test": "data"}', ttl_seconds=300, client=mock_redis)
        assert success is True
        mock_redis.set.assert_called_once_with("quiz:1:medium", '{"test": "data"}', ex=300)

        # Test get
        val = cache_get("quiz:1:medium", client=mock_redis)
        assert val == '{"test": "data"}'
        mock_redis.get.assert_called_once_with("quiz:1:medium")


def test_cache_get_handles_redis_exception():
    """Verify cache_get returns None when Redis raises an error."""
    mock_redis = MagicMock()
    mock_redis.get.side_effect = Exception("Redis connection error")

    val = cache_get("faulty_key", client=mock_redis)
    assert val is None
