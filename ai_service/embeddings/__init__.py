"""Embedding generation interfaces."""

from .embed import embed_chunks
from .store import query, upsert_document

__all__ = ["embed_chunks", "query", "upsert_document"]
