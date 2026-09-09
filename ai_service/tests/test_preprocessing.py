"""
Tests for AI Service preprocessing pipeline: text cleaner and token chunker.
"""

import pytest
from ai_service.preprocessing.cleaner import clean_text
from ai_service.preprocessing.chunker import chunk_text, NotesTooLargeError, MAX_TOKEN_LIMIT


def test_clean_text_normalizes_spaces_and_newlines():
    raw = "  This   is    a   test\n\n\nwith   multiple\nnewlines   "
    cleaned = clean_text(raw)
    assert "   " not in cleaned
    assert "\n\n" not in cleaned
    assert cleaned.startswith("This")
    assert cleaned.endswith("newlines")


def test_chunk_text_creates_chunks_with_overlap():
    text = "Photosynthesis is the process by which green plants and certain other organisms transform light energy into chemical energy. " * 30
    chunks = chunk_text(text, chunk_size=100, overlap=20)
    assert len(chunks) > 1
    assert all(isinstance(c, str) and len(c) > 0 for c in chunks)


def test_chunk_text_rejects_oversized_text():
    # Simulate text exceeding token limit
    oversized = "test word " * (MAX_TOKEN_LIMIT + 500)
    with pytest.raises(NotesTooLargeError):
        chunk_text(oversized)
