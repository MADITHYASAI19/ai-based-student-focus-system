def _register_and_login(client):
    client.post(
        "/api/auth/register",
        json={
            "email": "focus-events@example.com",
            "password": "securepassword123",
            "name": "Focus Student",
            "role": "student",
        },
    )
    return client.post(
        "/api/auth/login",
        json={"email": "focus-events@example.com", "password": "securepassword123"},
    ).json()["access_token"]


def test_record_derived_focus_event(client):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    session = client.post("/api/sessions/start", json={}, headers=headers).json()

    response = client.post(
        f"/api/sessions/{session['id']}/events",
        json={"event_type": "tab_switch", "strictness": "balanced"},
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["event_type"] == "tab_switch"


def test_record_focus_event_rejects_raw_or_unknown_event(client):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    session = client.post("/api/sessions/start", json={}, headers=headers).json()

    response = client.post(
        f"/api/sessions/{session['id']}/events",
        json={"event_type": "raw_video", "strictness": "strict"},
        headers=headers,
    )

    assert response.status_code == 400
