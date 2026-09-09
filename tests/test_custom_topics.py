from app.models.models import Topic


def test_create_plan_persists_custom_topic_name(client, db_session):
    client.post(
        "/api/auth/register",
        json={
            "email": "custom-topic@example.com",
            "password": "securepassword123",
            "name": "Custom Topic User",
            "role": "student",
        },
    )
    token = client.post(
        "/api/auth/login",
        json={"email": "custom-topic@example.com", "password": "securepassword123"},
    ).json()["access_token"]

    response = client.post(
        "/api/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "exam_deadline": "2026-12-31T23:59:59",
            "items": [{"topic_name": "Astrophysics fundamentals", "duration_minutes": 50}],
        },
    )

    assert response.status_code == 201
    item = response.json()["items"][0]
    assert item["topic_name"] == "Astrophysics fundamentals"
    assert item["duration_minutes"] == 50
    assert db_session.query(Topic).filter(Topic.name == "Astrophysics fundamentals").count() == 1
