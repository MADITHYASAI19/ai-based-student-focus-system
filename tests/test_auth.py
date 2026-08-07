def test_successful_register(client):
    """A user can register without exposing password data."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "securepassword123",
            "name": "Test User",
            "role": "student",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert data["role"] == "student"
    assert "id" in data
    assert "password" not in data
    assert "password_hash" not in data


def test_duplicate_email_register_fails(client):
    """A duplicate registration returns a conflict response."""
    registration_data = {
        "email": "test@example.com",
        "password": "securepassword123",
        "name": "Test User",
        "role": "student",
    }
    client.post("/api/auth/register", json=registration_data)

    response = client.post(
        "/api/auth/register",
        json={
            **registration_data,
            "password": "differentpassword",
            "name": "Another User",
        },
    )

    assert response.status_code == 409
    assert "Email already registered" in response.json()["detail"]


def test_successful_login_returns_token(client):
    """A registered user receives a bearer token after login."""
    client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "securepassword123",
            "name": "Test User",
            "role": "student",
        },
    )

    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "securepassword123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]


def test_wrong_password_login_fails(client):
    """Login rejects an incorrect password."""
    client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "securepassword123",
            "name": "Test User",
            "role": "student",
        },
    )

    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"},
    )

    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


def test_login_nonexistent_user_fails(client):
    """Login rejects an email that has not been registered."""
    response = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@example.com", "password": "anypassword"},
    )

    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]
