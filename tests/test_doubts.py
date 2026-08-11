from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from openai import APITimeoutError

from app.schemas.doubt import DoubtAnswer


def _register_and_login(client) -> tuple[int, str]:
    """Helper to register a user and return their ID and access token."""
    registration_response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "securepassword123",
            "name": "Test User",
            "role": "student",
        },
    )
    assert registration_response.status_code == 201
    user_id = registration_response.json()["id"]

    login_response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "securepassword123"},
    )
    assert login_response.status_code == 200
    return user_id, login_response.json()["access_token"]


def test_resolve_doubt_without_auth_returns_401(client):
    """Requesting doubt resolution without authentication returns 401."""
    response = client.post(
        "/api/doubts",
        json={"question": "What is photosynthesis?", "subject_id": 1},
    )
    assert response.status_code == 401


def test_resolve_doubt_with_auth_returns_200_with_valid_shape(client):
    """With authentication and normal mock answer, returns 200 with expected shape."""
    user_id, token = _register_and_login(client)

    # Mock the RAG query and LLM answer functions
    mock_query_result = [
        {
            "id": "math_notes_0",
            "text": "Photosynthesis is the process by which plants convert light energy into chemical energy.",
            "metadata": {"source_file": "biology_notes.txt"},
            "similarity_score": 0.95,
        }
    ]

    mock_llm_result = DoubtAnswer(
        answer_text="Photosynthesis is the process by which plants convert light energy into chemical energy.",
        source_chunk_ids=["math_notes_0"],
        confidence="high"
    )

    with patch("app.services.doubt_service.query") as mock_query, \
         patch("app.services.doubt_service.ai_answer_doubt") as mock_llm:
        mock_query.return_value = mock_query_result
        mock_llm.return_value = mock_llm_result

        response = client.post(
            "/api/doubts",
            json={"question": "What is photosynthesis?", "subject_id": 1},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        
        # Validate DoubtAnswer structure
        assert "answer_text" in data
        assert "source_chunk_ids" in data
        assert "confidence" in data
        assert isinstance(data["source_chunk_ids"], list)
        assert data["confidence"] in ["high", "low"]


def test_resolve_doubt_timeout_returns_504(client):
    """When mock simulates timeout, endpoint returns 504 not 500."""
    user_id, token = _register_and_login(client)

    # Mock query to return context, but LLM to timeout
    mock_query_result = [
        {
            "id": "math_notes_0",
            "text": "Context chunk",
            "metadata": {"source_file": "notes.txt"},
            "similarity_score": 0.95,
        }
    ]

    with patch("app.services.doubt_service.query") as mock_query, \
         patch("app.services.doubt_service.ai_answer_doubt") as mock_llm:
        mock_query.return_value = mock_query_result
        mock_llm.side_effect = APITimeoutError("Request timed out")

        response = client.post(
            "/api/doubts",
            json={"question": "What is photosynthesis?", "subject_id": 1},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 504
        data = response.json()
        assert "detail" in data
        assert "error" in data["detail"]
        assert "AI service took too long" in data["detail"]["error"]


def test_resolve_doubt_exception_returns_503(client):
    """When mock simulates general exception, endpoint returns 503 not 500."""
    user_id, token = _register_and_login(client)

    # Mock query to return context, but LLM to raise general exception
    mock_query_result = [
        {
            "id": "math_notes_0",
            "text": "Context chunk",
            "metadata": {"source_file": "notes.txt"},
            "similarity_score": 0.95,
        }
    ]

    with patch("app.services.doubt_service.query") as mock_query, \
         patch("app.services.doubt_service.ai_answer_doubt") as mock_llm:
        mock_query.return_value = mock_query_result
        mock_llm.side_effect = Exception("AI service unavailable")

        response = client.post(
            "/api/doubts",
            json={"question": "What is photosynthesis?", "subject_id": 1},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 503
        data = response.json()
        assert "detail" in data
        assert "error" in data["detail"]
        assert "Doubt resolution service unavailable" in data["detail"]["error"]


def test_resolve_doubt_empty_question_returns_400(client):
    """Sending empty question returns 400 validation error."""
    user_id, token = _register_and_login(client)

    response = client.post(
        "/api/doubts",
        json={"question": "", "subject_id": 1},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
