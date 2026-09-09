"""
Tests for AI Service Doubt Solver Guardrails and Confidence Logic.
Validates that:
1. Low similarity score (< 0.3) short-circuits to confidence="low" without calling LLM.
2. High similarity score (>= 0.3) calls LLM and returns confidence="high".
3. Empty context chunks returns confidence="low".
4. Empty question raises ValueError.
"""

import pytest
from unittest.mock import patch, MagicMock

from ai_service.generation.doubt_solver import answer_doubt
from app.schemas.doubt import DoubtAnswer


def test_doubt_guardrail_filters_low_similarity():
    """Similarity below 0.3 must return low confidence without calling the LLM."""
    context_chunks = [
        {
            "id": "chunk_off_topic_1",
            "text": "The Roman Empire fell in 476 AD.",
            "metadata": {"source_file": "history.txt"},
            "similarity_score": 0.18,
        }
    ]

    with patch("ai_service.generation.doubt_solver._call_llm") as mock_llm:
        result = answer_doubt("How do I bake a chocolate cake?", context_chunks)
        assert result.confidence == "low"
        assert "not confident" in result.answer_text.lower()
        assert result.source_chunk_ids == []
        mock_llm.assert_not_called()


def test_doubt_guardrail_allows_high_similarity():
    """Similarity at or above 0.3 proceeds to LLM and returns high confidence."""
    context_chunks = [
        {
            "id": "chunk_bio_1",
            "text": "Mitochondria produce ATP through cellular respiration.",
            "metadata": {"source_file": "biology.txt"},
            "similarity_score": 0.85,
        }
    ]

    mock_llm_response = "Mitochondria are known as the powerhouses of the cell because they produce ATP."

    with patch("ai_service.generation.doubt_solver._get_client") as mock_client, \
         patch("ai_service.generation.doubt_solver._call_llm", return_value=mock_llm_response) as mock_llm:
        result = answer_doubt("What is the function of mitochondria?", context_chunks)
        assert result.confidence == "high"
        assert result.answer_text == mock_llm_response
        assert result.source_chunk_ids == ["chunk_bio_1"]
        mock_llm.assert_called_once()


def test_doubt_guardrail_empty_context():
    """Empty context chunks must return low confidence immediately."""
    result = answer_doubt("What is gravity?", [])
    assert result.confidence == "low"
    assert "no relevant context" in result.answer_text.lower()
    assert result.source_chunk_ids == []


def test_doubt_guardrail_empty_question():
    """Empty question must raise ValueError."""
    with pytest.raises(ValueError, match="Question cannot be empty"):
        answer_doubt("   ", [{"id": "1", "text": "foo", "similarity_score": 0.5}])
