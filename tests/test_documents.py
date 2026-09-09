from app.models.models import Subject, Topic


def _create_user_and_topic(client, db_session):
    registration = client.post(
        "/api/auth/register",
        json={
            "email": "document-user@example.com",
            "password": "securepassword123",
            "name": "Document User",
            "role": "student",
        },
    )
    token = client.post(
        "/api/auth/login",
        json={"email": "document-user@example.com", "password": "securepassword123"},
    ).json()["access_token"]
    subject = Subject(name="Document Subject")
    db_session.add(subject)
    db_session.commit()
    topic = Topic(subject_id=subject.id, name="Document Topic", difficulty="medium", estimated_hours=3)
    db_session.add(topic)
    db_session.commit()
    return token, topic.id


def test_upload_processes_and_lists_topic_document(client, db_session, monkeypatch, tmp_path):
    token, topic_id = _create_user_and_topic(client, db_session)
    monkeypatch.setattr("app.services.document_service._UPLOAD_DIR", tmp_path)
    monkeypatch.setattr("app.services.document_service.embed_chunks", lambda chunks: [[0.1] for _ in chunks])
    monkeypatch.setattr("app.services.document_service.upsert_document", lambda **kwargs: None)
    monkeypatch.setattr(
        "app.services.document_service.analyze_document",
        lambda content, topic_name: {
            "concepts": ["recursion", "base cases"],
            "difficulty": "medium",
            "difficulty_reason": "It combines definitions with worked examples.",
            "estimated_hours": 2.5,
        },
    )

    response = client.post(
        f"/api/topics/{topic_id}/documents",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("recursion.txt", b"Recursion solves a problem by calling itself with a base case.", "text/plain")},
    )

    assert response.status_code == 201
    document = response.json()
    assert document["status"] == "completed"
    assert document["concepts"] == ["recursion", "base cases"]
    assert document["difficulty"] == "medium"
    assert document["estimated_hours"] == 2.5

    listed = client.get(
        f"/api/topics/{topic_id}/documents",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200
    assert listed.json()[0]["filename"] == "recursion.txt"


def test_upload_rejects_unsupported_file_type(client, db_session):
    token, topic_id = _create_user_and_topic(client, db_session)
    response = client.post(
        f"/api/topics/{topic_id}/documents",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("notes.docx", b"unsupported", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 400
    assert "Only PDF and text" in response.json()["detail"]
