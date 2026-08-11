from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.schemas.quiz import QuizQuestion
from app.models.models import Topic, Subject
from ai_service.generation.quiz_gen import QuizGenerationError


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


def _create_topic(db_session) -> int:
    """Helper to create a subject and topic for testing using the test session."""
    import uuid
    unique_suffix = str(uuid.uuid4())[:8]
    subject = Subject(name=f"Mathematics_{unique_suffix}")
    db_session.add(subject)
    db_session.commit()
    db_session.refresh(subject)
    
    topic = Topic(
        subject_id=subject.id,
        name="Binary Search Trees",
        difficulty="medium",
        estimated_hours=5
    )
    db_session.add(topic)
    db_session.commit()
    db_session.refresh(topic)
    return topic.id


def test_get_quiz_without_auth_returns_401(client):
    """Requesting a quiz without authentication returns 401."""
    response = client.get("/api/quizzes/1")
    assert response.status_code == 401


def test_get_quiz_with_auth_returns_200_with_valid_shape(client, db_session):
    """With authentication and valid topic_id, returns 200 with QuizOut-validating body."""
    user_id, token = _register_and_login(client)
    topic_id = _create_topic(db_session)

    # Mock the generate_quiz function to avoid real LLM calls
    mock_questions = [
        QuizQuestion(
            id=1,
            question_text="Test question 1",
            type="mcq",
            options=["A", "B", "C", "D"],
            correct_answer="A",
        ),
        QuizQuestion(
            id=2,
            question_text="Test question 2",
            type="mcq",
            options=["A", "B", "C", "D"],
            correct_answer="B",
        ),
    ]

    with patch("app.services.quiz_service.generate_quiz") as mock_generate:
        mock_generate.return_value = mock_questions

        response = client.get(
            f"/api/quizzes/{topic_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        
        # Validate QuizOut structure
        assert "topic_id" in data
        assert "difficulty" in data
        assert "questions" in data
        assert isinstance(data["questions"], list)
        assert len(data["questions"]) == 2
        
        # Validate question structure
        question = data["questions"][0]
        assert "question_text" in question
        assert "type" in question
        assert "correct_answer" in question


def test_get_quiz_calls_cache_logic(client, db_session):
    """Test that cache logic is called correctly (cache_get and cache_set)."""
    user_id, token = _register_and_login(client)
    topic_id = _create_topic(db_session)

    mock_questions = [
        QuizQuestion(
            id=1,
            question_text="Test question",
            type="mcq",
            options=["A", "B", "C", "D"],
            correct_answer="A",
        ),
    ]

    with patch("app.services.quiz_service.generate_quiz") as mock_generate, \
         patch("app.services.quiz_service.cache_get") as mock_cache_get, \
         patch("app.services.quiz_service.cache_set") as mock_cache_set:
        
        # Cache miss scenario
        mock_cache_get.return_value = None
        mock_generate.return_value = mock_questions

        response = client.get(
            f"/api/quizzes/{topic_id}?difficulty=medium",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert mock_cache_get.call_count == 1  # Should check cache first
        assert mock_cache_set.call_count == 1  # Should cache the result


def test_get_quiz_invalid_topic_id_returns_404(client):
    """Requesting quiz for non-existent topic returns 404."""
    user_id, token = _register_and_login(client)

    with patch("app.services.quiz_service.generate_quiz") as mock_generate:
        mock_generate.return_value = []

        response = client.get(
            "/api/quizzes/999",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404


def test_get_quiz_generation_error_returns_503(client, db_session):
    """When quiz generation fails after retries, returns 503 not 500."""
    user_id, token = _register_and_login(client)
    topic_id = _create_topic(db_session)

    with patch("app.services.quiz_service.generate_quiz") as mock_generate:
        mock_generate.side_effect = QuizGenerationError("LLM failed to generate valid JSON after retries")

        response = client.get(
            f"/api/quizzes/{topic_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 503
        data = response.json()
        assert "detail" in data
        assert "error" in data["detail"]
        assert "Quiz generation failed" in data["detail"]["error"]
