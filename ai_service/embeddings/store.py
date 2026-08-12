"""ChromaDB storage and retrieval helpers for subject-scoped RAG collections."""

import os
from typing import Any
from urllib.parse import urlparse
from functools import lru_cache

import chromadb
from dotenv import load_dotenv


@lru_cache(maxsize=1)
def _get_client():
    """Create and cache the configured embedded or HTTP Chroma client."""
    load_dotenv()
    chroma_mode = os.getenv("CHROMA_MODE", "embedded").lower()

    if chroma_mode == "embedded":
        return chromadb.PersistentClient(path="./chroma_data")
    if chroma_mode != "http":
        raise ValueError("CHROMA_MODE must be either 'embedded' or 'http'")

    chroma_url = os.getenv("CHROMA_URL", "http://localhost:8001")
    parsed_url = urlparse(chroma_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname:
        raise ValueError("CHROMA_URL must be an absolute HTTP(S) URL")

    return chromadb.HttpClient(
        host=parsed_url.hostname,
        port=parsed_url.port or (443 if parsed_url.scheme == "https" else 80),
        ssl=parsed_url.scheme == "https",
    )


def upsert_document(
    collection_name: str,
    doc_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    metadata: dict[str, Any],
) -> None:
    """Store a document's chunks in a subject collection.

    The caller should scope ``collection_name`` as ``subject_{subject_id}``.
    Reusing a document ID replaces its existing chunks at matching positions.
    
    Note: embeddings must be pre-computed and passed in - this function
    does not compute embeddings to avoid circular import issues.
    """
    if not collection_name.strip() or not doc_id.strip():
        raise ValueError("collection_name and doc_id must be non-empty")
    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must have the same length")
    if not chunks:
        return

    _validate_chunks(chunks)
    collection = _get_collection(collection_name)
    collection.upsert(
        ids=[f"{doc_id}_{index}" for index in range(len(chunks))],
        documents=chunks,
        embeddings=embeddings,
        metadatas=[
            {**metadata, "document_id": doc_id, "chunk_index": index}
            for index in range(len(chunks))
        ],
    )


def query(collection_name: str, query_text: str, top_k: int = 5) -> list[dict[str, Any]]:
    """Return the most similar chunks in a collection for ``query_text``.

    Each result contains its Chroma chunk ID, source text, metadata, and a
    cosine similarity score in the 0-to-1 range.
    """
    if not collection_name.strip():
        raise ValueError("collection_name must be non-empty")
    if not query_text.strip():
        raise ValueError("query_text must be non-empty")
    if top_k < 1:
        raise ValueError("top_k must be at least 1")

    collection = _get_collection(collection_name)
    # Lazy import to avoid circular dependency
    from .embed import embed_chunks
    query_embedding = embed_chunks([query_text])[0]
    response = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    ids = response.get("ids", [[]])[0]
    documents = response.get("documents", [[]])[0]
    metadatas = response.get("metadatas", [[]])[0]
    distances = response.get("distances", [[]])[0]

    return [
        {
            "id": chunk_id,
            "text": document,
            "metadata": metadata or {},
            "similarity_score": max(0.0, min(1.0, 1.0 - float(distance))),
        }
        for chunk_id, document, metadata, distance in zip(
            ids, documents, metadatas, distances, strict=True
        )
    ]


def _get_collection(collection_name: str):
    """Return a collection configured for cosine-distance retrieval."""
    return _get_client().get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def _validate_chunks(chunks: list[str]) -> None:
    if any(not isinstance(chunk, str) or not chunk.strip() for chunk in chunks):
        raise ValueError("chunks must contain only non-empty strings")
