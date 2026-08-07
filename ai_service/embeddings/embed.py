"""OpenAI embedding helpers for the RAG pipeline.

This module deliberately has no FastAPI or application-layer imports, so it
can be used by workers, scripts, and the future API service alike.
"""

import os
import time

from dotenv import load_dotenv
from openai import OpenAI


EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100
MAX_RETRIES = 2


def embed_chunks(chunks: list[str]) -> list[list[float]]:
    """Return an embedding for every supplied text chunk, in input order.

    OpenAI accepts a list of strings in a single embeddings request. Chunks are
    sent in bounded batches to make large document ingestion reliable. Each
    batch is retried up to ``MAX_RETRIES`` times after a transient failure.

    Args:
        chunks: Non-empty text chunks produced by the preprocessing pipeline.

    Raises:
        ValueError: If ``OPENAI_API_KEY`` is missing or a chunk is invalid.
        RuntimeError: If a batch cannot be embedded after all retry attempts.
    """
    if not chunks:
        return []
    if any(not isinstance(chunk, str) or not chunk.strip() for chunk in chunks):
        raise ValueError("chunks must contain only non-empty strings")

    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")

    client = OpenAI(api_key=api_key)
    embeddings: list[list[float]] = []

    for start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[start : start + BATCH_SIZE]
        response = _embed_batch_with_retry(client, batch)
        ordered_items = sorted(response.data, key=lambda item: item.index)

        if len(ordered_items) != len(batch):
            raise RuntimeError("Embedding API returned an incomplete batch")

        embeddings.extend([item.embedding for item in ordered_items])

    return embeddings


def _embed_batch_with_retry(client: OpenAI, batch: list[str]):
    """Call the embedding API, retrying failures with short exponential backoff."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            return client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"Embedding batch failed after {MAX_RETRIES + 1} attempts"
                ) from exc
            time.sleep(2**attempt)

    raise AssertionError("unreachable")
