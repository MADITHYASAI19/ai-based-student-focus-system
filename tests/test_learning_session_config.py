def _register_and_login(client):
    client.post(
        "/api/auth/register",
        json={
            "email": "learning-config@example.com",
            "password": "securepassword123",
            "name": "Learning Config User",
            "role": "student",
        },
    )
    return client.post(
        "/api/auth/login",
        json={"email": "learning-config@example.com", "password": "securepassword123"},
    ).json()["access_token"]


def test_all_plans_and_learning_session_configuration(client):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    plan = client.post(
        "/api/plans",
        headers=headers,
        json={
            "exam_deadline": "2026-12-31T23:59:59",
            "items": [{"topic_name": "Operating Systems", "duration_minutes": 45}],
        },
    ).json()

    plans = client.get("/api/plans", headers=headers)
    assert plans.status_code == 200
    assert plans.json()[0]["id"] == plan["id"]

    session = client.post(
        "/api/sessions/start",
        headers=headers,
        json={
            "plan_item_id": plan["items"][0]["id"],
            "subtopic": "System Calls",
            "explanation_mode": "topper",
            "duration_minutes": 45,
        },
    )
    assert session.status_code == 201
    assert session.json()["plan_item_id"] == plan["items"][0]["id"]
    assert session.json()["subtopic"] == "System Calls"
    assert session.json()["explanation_mode"] == "topper"
    assert session.json()["duration_minutes"] == 45
