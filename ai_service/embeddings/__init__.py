"""Embedding generation interfaces."""

# Lazy imports to avoid loading SentenceTransformer at import time
def embed_chunks(*args, **kwargs):
    from .embed import embed_chunks as _embed_chunks
    return _embed_chunks(*args, **kwargs)

def query(*args, **kwargs):
    from .store import query as _query
    return _query(*args, **kwargs)

def upsert_document(*args, **kwargs):
    from .store import upsert_document as _upsert_document
    return _upsert_document(*args, **kwargs)

__all__ = ["embed_chunks", "query", "upsert_document"]
