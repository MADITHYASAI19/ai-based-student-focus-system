import os
import time
from typing import List, Optional
from dotenv import load_dotenv
from app.core.config import get_settings

class GroqKeyManager:
    """
    Manages rotation and health of multiple Groq API keys to distribute load
    and handle rate limits.
    """
    def __init__(self):
        self.settings = get_settings()
        load_dotenv()

        raw_keys = list(self.settings.AI_API_KEYS)
        if not raw_keys and getattr(self.settings, "AI_API_KEY", None):
            raw_keys = [self.settings.AI_API_KEY]

        # Fallback: If keys list is empty, try to find GROQ_API_KEY_N in env
        if not raw_keys:
            found_keys = []
            i = 1
            while True:
                key = os.getenv(f"GROQ_API_KEY_{i}")
                if not key:
                    break
                found_keys.append(key)
                i += 1
            if found_keys:
                raw_keys = found_keys
            elif os.getenv("AI_API_KEY"):
                raw_keys = [os.getenv("AI_API_KEY")]

        self.keys = [k.strip() for k in raw_keys if k and k.strip()]
        self.current_index = 0
        self.key_health = {key: {"available": True, "retry_at": 0} for key in self.keys}

    def get_key(self) -> str:
        """
        Returns the next available API key using round-robin rotation.
        If no keys are currently available, returns the first key as a last resort.
        """
        if not self.keys:
            raise RuntimeError("No Groq API keys configured in environment variables or .env file.")

        start_index = self.current_index
        while True:
            key = self.keys[self.current_index]
            health = self.key_health[key]

            if health["available"] or time.time() > health["retry_at"]:
                # Key is available or retry time has passed
                self.key_health[key]["available"] = True
                self.current_index = (self.current_index + 1) % len(self.keys)
                return key

            self.current_index = (self.current_index + 1) % len(self.keys)
            if self.current_index == start_index:
                # All keys are rate-limited, return the one with the earliest retry time
                return min(self.keys, key=lambda k: self.key_health[k]["retry_at"])

    def report_failure(self, key: Optional[str], is_rate_limit: bool = True):
        """
        Marks a key as unavailable if it hits a rate limit.
        """
        if not key or key not in self.key_health:
            return
        if is_rate_limit:
            # Mark as unavailable for 1 minute (typical Groq rate limit window)
            self.key_health[key] = {
                "available": False,
                "retry_at": time.time() + 60
            }
