def _register_and_login(client) -> tuple[int, str]:
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


def test_create_plan_requires_auth(client):
    """Creating a plan without an Authorization header returns 401."""
    response = client.post(
        "/api/plans",
        json={"exam_deadline": "2026-12-31T23:59:59", "items": []},
    )

    assert response.status_code == 401


def test_create_plan_succeeds_for_authenticated_user(client):
    """The plan owner is derived from the authenticated user, not request JSON."""
    user_id, token = _register_and_login(client)

    response = client.post(
        "/api/plans",
        json={"exam_deadline": "2026-12-31T23:59:59", "items": []},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["student_id"] == user_id
    assert data["status"] == "pending"
    assert data["items"] == []
    assert "id" in data
    assert "generated_at" in data


def test_fetch_nonexistent_plan_returns_404(client):
    """An authenticated user receives 404 for a missing plan."""
    _, token = _register_and_login(client)

    response = client.get(
        "/api/plans/999",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert "Study plan not found" in response.json()["detail"]


def test_fetch_existing_plan_succeeds(client):
    """An authenticated user can fetch their newly created plan."""
    user_id, token = _register_and_login(client)
    create_response = client.post(
        "/api/plans",
        json={"exam_deadline": "2026-12-31T23:59:59", "items": []},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get(
        f"/api/plans/{user_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert create_response.status_code == 201
    assert response.status_code == 200
    data = response.json()
    assert data["student_id"] == user_id
    assert data["status"] == "pending"
    assert data["items"] == []
