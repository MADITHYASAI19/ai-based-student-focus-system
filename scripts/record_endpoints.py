import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"

def run():
    results = []

    # 1. Health
    cmd = "curl -X GET http://localhost:8000/health"
    req = urllib.request.Request(f"{BASE}/health", method="GET")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("GET", "/health", "No", cmd, body, f"{resp.status} OK"))

    import uuid
    uid = uuid.uuid4().hex[:6]
    email = f"report_user_{uid}@test.local"
    reg_body = {
        "email": email,
        "password": "SecurePassword123!",
        "name": "Audit User",
        "role": "student"
    }
    cmd = ("curl -X POST http://localhost:8000/api/auth/register "
           "-H \"Content-Type: application/json\" "
           f"-d '{{\"email\":\"{email}\",\"password\":\"SecurePassword123!\",\"name\":\"Audit User\",\"role\":\"student\"}}'")
    req = urllib.request.Request(f"{BASE}/api/auth/register", data=json.dumps(reg_body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            results.append(("POST", "/api/auth/register", "No", cmd, body, f"{resp.status} Created"))
    except urllib.error.HTTPError as e:
        # maybe already registered, still record
        body = e.read().decode()
        results.append(("POST", "/api/auth/register", "No", cmd, body, f"{e.code}"))

    # 3. Login
    login_body = {"email": email, "password": "SecurePassword123!"}
    cmd = ("curl -X POST http://localhost:8000/api/auth/login "
           "-H \"Content-Type: application/json\" "
           f"-d '{{\"email\":\"{email}\",\"password\":\"SecurePassword123!\"}}'")
    req = urllib.request.Request(f"{BASE}/api/auth/login", data=json.dumps(login_body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        token = json.loads(body)["access_token"]
        results.append(("POST", "/api/auth/login", "No", cmd, body, f"{resp.status} OK"))

    # Get student_id from token or register body
    import base64
    payload = json.loads(base64.b64decode(token.split('.')[1] + '==').decode())
    student_id = int(payload["sub"])

    auth_hdr = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}

    # 4. Create Plan
    plan_body = {
        "exam_deadline": "2027-06-01T00:00:00",
        "items": [{"topic_id": 1, "duration_minutes": 60}]
    }
    cmd = ("curl -X POST http://localhost:8000/api/plans "
           f"-H \"Authorization: Bearer <JWT>\" "
           "-H \"Content-Type: application/json\" "
           "-d '{\"exam_deadline\":\"2027-06-01T00:00:00\",\"items\":[{\"topic_id\":1,\"duration_minutes\":60}]}'")
    req = urllib.request.Request(f"{BASE}/api/plans", data=json.dumps(plan_body).encode(),
                                 headers=auth_hdr, method="POST")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("POST", "/api/plans", "Yes", cmd, body, f"{resp.status} Created"))

    # 5. Get Plan
    cmd = (f"curl -X GET http://localhost:8000/api/plans/{student_id} "
           f"-H \"Authorization: Bearer <JWT>\"")
    req = urllib.request.Request(f"{BASE}/api/plans/{student_id}", headers=auth_hdr, method="GET")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("GET", f"/api/plans/{{student_id}}", "Yes", cmd, body, f"{resp.status} OK"))

    # 6. Start Session
    cmd = ("curl -X POST http://localhost:8000/api/sessions/start "
           f"-H \"Authorization: Bearer <JWT>\" "
           "-H \"Content-Type: application/json\" -d '{}'")
    req = urllib.request.Request(f"{BASE}/api/sessions/start", data=b"{}", headers=auth_hdr, method="POST")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        session_id = json.loads(body)["id"]
        results.append(("POST", "/api/sessions/start", "Yes", cmd, body, f"{resp.status} Created"))

    # 7. End Session
    cmd = (f"curl -X PATCH http://localhost:8000/api/sessions/{session_id}/end "
           f"-H \"Authorization: Bearer <JWT>\"")
    req = urllib.request.Request(f"{BASE}/api/sessions/{session_id}/end", headers=auth_hdr, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("PATCH", "/api/sessions/{session_id}/end", "Yes", cmd, body, f"{resp.status} OK"))

    # 8. Generate / Get Quiz
    cmd = (f"curl -X GET 'http://localhost:8000/api/quizzes/1?difficulty=medium' "
           f"-H \"Authorization: Bearer <JWT>\"")
    req = urllib.request.Request(f"{BASE}/api/quizzes/1?difficulty=medium", headers=auth_hdr, method="GET")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("GET", "/api/quizzes/{topic_id}", "Yes", cmd, body, f"{resp.status} OK"))

    # 9. Submit Quiz Attempt
    attempt_body = {"answers": {"0": "O(log n)", "1": "test"}}
    cmd = ("curl -X POST http://localhost:8000/api/quizzes/1/attempt "
           f"-H \"Authorization: Bearer <JWT>\" "
           "-H \"Content-Type: application/json\" "
           "-d '{\"answers\":{\"0\":\"O(log n)\",\"1\":\"test\"}}'")
    req = urllib.request.Request(f"{BASE}/api/quizzes/1/attempt", data=json.dumps(attempt_body).encode(),
                                 headers=auth_hdr, method="POST")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("POST", "/api/quizzes/{quiz_id}/attempt", "Yes", cmd, body, f"{resp.status} Created"))

    # 10. Ask Doubt
    doubt_body = {"question": "What is the quadratic formula?", "subject_id": 1}
    cmd = ("curl -X POST http://localhost:8000/api/doubts "
           f"-H \"Authorization: Bearer <JWT>\" "
           "-H \"Content-Type: application/json\" "
           "-d '{\"question\":\"What is the quadratic formula?\",\"subject_id\":1}'")
    req = urllib.request.Request(f"{BASE}/api/doubts", data=json.dumps(doubt_body).encode(),
                                 headers=auth_hdr, method="POST")
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        results.append(("POST", "/api/doubts", "Yes", cmd, body, f"{resp.status} OK"))

    with open("scripts/endpoint_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Recorded all endpoints successfully!")

if __name__ == "__main__":
    run()
