def _register_and_login(client) -> tuple[int, str]:
    registration_response = client.post(
        "/api/auth/register",
        json={
            "email": "quizstudent@example.com",
            "password": "securepassword123",
            "name": "Quiz Student",
            "role": "student",
        },
    )
    assert registration_response.status_code == 201
    user_id = registration_response.json()["id"]

    login_response = client.post(
        "/api/auth/login",
        json={"email": "quizstudent@example.com", "password": "securepassword123"},
    )
    assert login_response.status_code == 200
    return user_id, login_response.json()["access_token"]


def test_get_quiz_requires_auth(client):
    """Accessing the quiz endpoint without authentication returns 401."""
    response = client.get("/api/quizzes/1?difficulty=medium")
    assert response.status_code == 401


def test_get_quiz_returns_valid_quiz_out_schema(client):
    """Authenticated GET /api/quizzes/{topic_id} returns a valid QuizOut structure."""
    _, token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/quizzes/42?difficulty=hard", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["topic_id"] == 42
    assert data["difficulty"] == "hard"
    assert isinstance(data["questions"], list)
    assert len(data["questions"]) >= 3

    for q in data["questions"]:
        assert "id" in q
        assert "question_text" in q
        assert q["type"] in ["mcq", "short_answer", "coding"]
        assert isinstance(q["options"], list)
        assert q["correct_answer"] in q["options"]
