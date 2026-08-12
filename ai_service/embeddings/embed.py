"""Simple embedding helpers for the RAG pipeline.

This module deliberately has no FastAPI or application-layer imports, so it
can be used by workers, scripts, and the future API service alike.
"""

import os
from typing import List
from functools import lru_cache

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer


# Use a small, fast model for demo purposes
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _get_model():
    """Lazy-load and cache the SentenceTransformer model."""
    return SentenceTransformer(EMBEDDING_MODEL)


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    """Return an embedding for every supplied text chunk, in input order.

    Uses sentence-transformers for local embedding generation (no API key needed).

    Args:
        chunks: Non-empty text chunks produced by the preprocessing pipeline.

    Raises:
        ValueError: If chunks are invalid.
    """
    if not chunks:
        return []
    if any(not isinstance(chunk, str) or not chunk.strip() for chunk in chunks):
        raise ValueError("chunks must contain only non-empty strings")

    load_dotenv()
    
    # Load model lazily (cached after first call)
    model = _get_model()
    
    # Generate embeddings
    embeddings = model.encode(chunks, convert_to_numpy=False)
    
    # Convert tensors to lists if needed
    if hasattr(embeddings, 'tolist'):
        return embeddings.tolist()
    elif isinstance(embeddings, list) and hasattr(embeddings[0], 'tolist'):
        return [e.tolist() for e in embeddings]
    return embeddings
