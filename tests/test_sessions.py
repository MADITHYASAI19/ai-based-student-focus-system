def _register_and_login(client, email="test@example.com", name="Test User") -> tuple[int, str]:
    registration_response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "securepassword123",
            "name": name,
            "role": "student",
        },
    )
    assert registration_response.status_code == 201
    user_id = registration_response.json()["id"]

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "securepassword123"},
    )
    assert login_response.status_code == 200
    return user_id, login_response.json()["access_token"]


def test_start_session_requires_auth(client):
    """Starting a session without authentication returns 401."""
    response = client.post("/api/sessions/start", json={})
    assert response.status_code == 401


def test_start_and_end_session_returns_non_null_focus_score(client):
    """Starting then ending a session returns a session with a non-null focus_score."""
    user_id, token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Start session
    start_response = client.post("/api/sessions/start", json={}, headers=headers)
    assert start_response.status_code == 201
    session_data = start_response.json()
    assert session_data["student_id"] == user_id
    assert session_data["started_at"] is not None
    assert session_data["ended_at"] is None
    assert session_data["focus_score"] is None
    session_id = session_data["id"]

    # End session
    end_response = client.patch(f"/api/sessions/{session_id}/end", headers=headers)
    assert end_response.status_code == 200
    ended_data = end_response.json()
    assert ended_data["id"] == session_id
    assert ended_data["ended_at"] is not None
    assert ended_data["focus_score"] is not None
    assert isinstance(ended_data["focus_score"], float)


def test_end_session_belonging_to_another_user_fails(client):
    """Ending a session that belongs to a different student returns 403."""
    user1_id, token1 = _register_and_login(client, email="user1@example.com", name="User One")
    _, token2 = _register_and_login(client, email="user2@example.com", name="User Two")

    # User 1 starts session
    start_response = client.post(
        "/api/sessions/start",
        json={},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert start_response.status_code == 201
    session_id = start_response.json()["id"]

    # User 2 tries to end User 1's session
    end_response = client.patch(
        f"/api/sessions/{session_id}/end",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert end_response.status_code == 403
