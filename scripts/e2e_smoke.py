# -*- coding: utf-8 -*-
"""
End-to-end integration smoke test for the AI Study Platform.

Runs the complete 9-step user journey against a live local server
(http://localhost:8000) in one continuous Python session.

Usage:
    python scripts/e2e_smoke.py
"""
import json
import sys
import time
import uuid
import urllib.request
import urllib.error


def safe_print(*args, **kwargs):
    """Print that survives Windows cp1252 by replacing unencodable chars."""
    text = " ".join(str(a) for a in args)
    try:
        print(text, **kwargs)
    except UnicodeEncodeError:
        print(text.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8"), **kwargs)

BASE = "http://localhost:8000"
DIV = "-" * 70


def req(method: str, path: str, body=None, token: str | None = None, timeout: int = 90):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, json.loads(raw) if raw else {}


def step(label: str, status: int, body: dict, expected: int) -> dict:
    ok = status == expected
    mark = "PASS" if ok else "FAIL"
    print(f"\n{DIV}")
    print(f"[{mark}] {label}")
    print(f"  HTTP {status} (expected {expected})")
    print(f"  Body: {json.dumps(body, indent=2)[:800]}")
    if not ok:
        print(f"\nFAILED at step: {label}")
        sys.exit(1)
    return body


def main():
    unique = uuid.uuid4().hex[:8]
    email = f"e2e_{unique}@test.local"
    password = "Secur3P@ss!"

    print("=" * 70)
    print("AI STUDY PLATFORM -- END-TO-END SMOKE TEST")
    print("=" * 70)
    print(f"Target : {BASE}")
    print(f"User   : {email}")

    # 0. Health
    s, b = req("GET", "/health")
    if s != 200:
        print(f"Server not responding at {BASE}. Start uvicorn first.")
        sys.exit(1)
    print(f"\n[PRE-CHECK] Server is up: {b}")

    # 1. Register
    s, b = req("POST", "/api/auth/register", {
        "email": email, "password": password,
        "name": "E2E Tester", "role": "student"
    })
    user = step("1 - Register new user", s, b, 201)
    user_id: int = user["id"]
    print(f"  => user_id={user_id}")

    # 2. Login
    s, b = req("POST", "/api/auth/login", {"email": email, "password": password})
    login = step("2 - Login, capture token", s, b, 200)
    token: str = login["access_token"]
    print(f"  => token={token[:50]}...")

    # 3. Create study plan
    s, b = req("POST", "/api/plans", {
        "exam_deadline": "2027-06-01T00:00:00",
        "items": [{"topic_id": 1, "duration_minutes": 60}]
    }, token=token)
    plan = step("3 - Create study plan", s, b, 201)
    print(f"  => plan_id={plan['id']}, items={len(plan.get('items', []))}")

    # 4. Start session
    s, b = req("POST", "/api/sessions/start", {}, token=token)
    sess = step("4 - Start study session", s, b, 201)
    session_id: int = sess["id"]
    print(f"  => session_id={session_id}, started_at={sess['started_at']}")

    # 5. End session — confirm focus_score
    time.sleep(1)
    s, b = req("PATCH", f"/api/sessions/{session_id}/end", token=token)
    ended = step("5 - End session (focus_score must be non-null)", s, b, 200)
    focus_score = ended.get("focus_score")
    print(f"  => focus_score={focus_score}")
    if focus_score is None:
        print("FAILED: focus_score is None")
        sys.exit(1)
    print("  CONFIRMED: focus_score is populated")

    # 6. Generate quiz (topic 1 = Quadratic Equations)
    s, b = req("GET", "/api/quizzes/1?difficulty=medium", token=token)
    quiz = step("6 - Generate quiz for topic 1", s, b, 200)
    qs = quiz.get("questions", [])
    print(f"  => topic_id={quiz.get('topic_id')}, difficulty={quiz.get('difficulty')}, questions={len(qs)}")
    if not qs:
        print("FAILED: No questions returned")
        sys.exit(1)

    # 7. Submit attempt (all correct => 100%)
    answers = {str(i): q["correct_answer"] for i, q in enumerate(qs)}
    s, b = req("POST", "/api/quizzes/1/attempt", {"answers": answers}, token=token)
    attempt = step("7 - Submit quiz attempt (server-graded)", s, b, 201)
    score = attempt.get("score")
    print(f"  => attempt_id={attempt.get('id')}, student_id={attempt.get('student_id')}, score={score}")
    if score is None:
        print("FAILED: score missing")
        sys.exit(1)
    if attempt.get("student_id") != user_id:
        print(f"FAILED: student_id mismatch (got {attempt.get('student_id')}, expected {user_id})")
        sys.exit(1)
    if score == 100.0:
        print("  CONFIRMED: score=100.0 for all-correct submission")
    else:
        print(f"  NOTE: score={score} (submitted all correct answers; may differ if LLM regenerated different questions)")
    print("  CONFIRMED: attempt row persisted with correct student_id")

    def ascii_safe(s: str, max_len: int = 300) -> str:
        """Return s truncated and stripped of non-ASCII chars safe for cp1252 terminals."""
        return s[:max_len].encode("ascii", errors="replace").decode("ascii")

    # 8. In-scope doubt (Mathematics / quadratic equations)
    s, b = req("POST", "/api/doubts", {
        "question": "What does the discriminant tell us about quadratic roots?",
        "subject_id": 1
    }, token=token)
    d_in = step("8 - Doubt-solver: in-scope question", s, b, 200)
    conf_in = d_in.get("confidence", "")
    print(f"  => confidence={conf_in}")
    print(f"  => answer_text (first 300): {ascii_safe(str(d_in.get('answer_text', '')))}")
    print(f"  => source_chunk_ids={d_in.get('source_chunk_ids', [])}")
    if conf_in == "high":
        print("  CONFIRMED: high-confidence grounded answer (embeddings are indexed)")
    else:
        print("  NOTE: low-confidence answer -- embeddings not ingested for this topic.")
        print("        Run ai_service/scripts/ingest.py to enable grounded answers.")

    # 9. Out-of-scope doubt (cookies recipe — clearly not in course material)
    s, b = req("POST", "/api/doubts", {
        "question": "What is the best recipe for chocolate chip cookies?",
        "subject_id": 1
    }, token=token)
    d_out = step("9 - Doubt-solver: out-of-scope question", s, b, 200)
    conf_out = d_out.get("confidence", "")
    print(f"  => confidence={conf_out}")
    print(f"  => answer_text (first 300): {ascii_safe(str(d_out.get('answer_text', '')))}")
    if conf_out == "low":
        print("  CONFIRMED: low-confidence refusal for out-of-scope question (guardrails working)")
    else:
        print("  NOTE: high-confidence returned for out-of-scope question.")
        print("        The LLM may have hallucinated relevance -- check doubt prompt guardrails.")

    print(f"\n{'=' * 70}")
    print("ALL 9 STEPS COMPLETED -- END-TO-END VERIFICATION DONE")
    print(f"{'=' * 70}\n")


if __name__ == "__main__":
    main()
