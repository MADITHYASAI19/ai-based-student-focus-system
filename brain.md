# BRAIN.md — AI Study Companion (Project Memory)

> Give this single file to an AI instead of the whole repo. It has everything
> needed to understand the codebase and work on it correctly.

---

## 1. What this project is

**AI-Based Student Focus System / AI Study Companion** — an adaptive study
platform with:
- Focus tracking during study sessions (webcam-based, in the browser)
- AI-generated quizzes (LLM, server-graded)
- RAG-powered "doubt solver" (ask questions grounded in uploaded study docs)
- AI-generated / adaptive study plans built from topics & documents
- Document upload + AI analysis (concepts, structure, difficulty, est. hours)

Three moving parts, all in **one repo**:

| Part | Path | Tech |
|---|---|---|
| **Backend API** | `app/` | FastAPI + SQLAlchemy + Alembic |
| **AI / ML service** | `ai_service/` | Pure Python, framework-agnostic (no FastAPI imports) |
| **Frontend** | `frontend/` | React 19 + TypeScript + Vite + Tailwind |

---

## 2. Architecture at a glance

| Layer | Local dev | Production |
|---|---|---|
| Database | SQLite (`study_companion.db`) | PostgreSQL 16 |
| Cache | In-process `cachetools.TTLCache` (auto-fallback) | Redis 7 |
| Vector store | Embedded `chromadb.PersistentClient` (`./chroma_data/`) | ChromaDB HTTP server |
| LLM | Groq API (OpenAI-compatible endpoint) | same |
| Backend | FastAPI + Uvicorn | same, containerised |
| Frontend | Vite dev server | built static bundle |
| Focus detection | `@mediapipe/tasks-vision` running **client-side in the browser** | same — no ML server needed for this |

Key design point: **Redis, Postgres and a Chroma server are NOT required for
local dev.** Everything degrades gracefully to SQLite / in-process cache /
embedded Chroma automatically.

---

## 3. Repo map

```
app/                          # FastAPI backend
├── core/                     # config.py (Settings/env), database.py, security.py (JWT/hash), cache.py (Redis/TTL fallback)
├── models/models.py          # SQLAlchemy ORM models (single file, see §5)
├── routers/                  # auth, plans, sessions, quizzes, doubts, documents
├── schemas/                  # Pydantic request/response models (mirrors routers) + face_tracking.py
├── services/                 # business logic: auth, plan, session, quiz, doubt, document, face_tracking
├── scripts/seed_dev_data.py  # idempotent dev seed (Mathematics/Biology subjects + topics)
└── main.py                   # create_app(), CORS, router registration, /health

ai_service/                   # AI/ML pipeline — pure Python, NO FastAPI imports, testable standalone
├── preprocessing/            # cleaner.py, chunker.py — text cleaning + chunking for embeddings
├── embeddings/               # embed.py, store.py — embedding generation + ChromaDB storage/search
├── generation/                # quiz_gen.py, plan_gen.py, doubt_solver.py, topic_explainer.py,
│                              #   document_analyzer.py, provider.py (LLM client wrapper)
├── prompts/                  # quiz_prompt.py, doubt_prompt.py — prompt templates
├── scripts/                  # manual test/stress scripts, sample_notes/ for local testing
├── config.py                 # AI-service specific settings
└── requirements.txt          # anthropic, openai, chromadb, tiktoken, pypdf, python-dotenv, sentence-transformers

alembic/versions/             # 5 migrations (schema history, see §6)

frontend/src/
├── api/client.ts, types.ts   # Axios client + TS types (single source of truth for API shape)
├── contexts/AuthContext.tsx  # JWT auth state
├── hooks/useSession.ts, usePlan.ts, useFocusMonitoring.ts  # webcam focus detection hook (mediapipe)
├── components/               # Navbar, AppLayout, ProtectedRoute
└── pages/                    # LoginPage, RegisterPage, PlannerPage, SessionPage, QuizPage, DoubtChatPage, ProfilePage

tests/                        # pytest, SQLite in-memory + mocked LLM calls, no network needed
docs/                         # architecture diagrams, business strategy, project docs (background reading only)
uploads/study_documents/      # uploaded study files (git-ignored in real use)
docker-compose.yml            # PRODUCTION stack: postgres + redis + chroma(http) + api
docker-compose.dev.yml        # DEV extra: chroma HTTP server only (optional)
.env.example                  # all env vars, see §7
run.txt                       # old manual run notes (superseded by RUN_BACKEND.txt / RUN_FRONTEND.txt)
```

---

## 4. API surface (all under `/api`, JWT bearer auth except where noted)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Register user |
| POST | `/api/auth/login` | – | Login → JWT |
| GET | `/api/auth/me/profile` | ✅ | Get profile |
| GET | `/api/plans` | ✅ | List all study plans |
| POST | `/api/plans` | ✅ | Create study plan |
| GET | `/api/plans/{student_id}` | ✅ | Get student's latest plan |
| POST | `/api/plans/breakdown` | ✅ | Break a topic into sub-items |
| POST | `/api/plans/explain` | ✅ | AI-explain a topic |
| PATCH | `/api/plans/items/{item_id}/status` | ✅ | Update plan item status |
| GET | `/api/plans/active/current` | ✅ | Get currently active/finalized plan |
| POST | `/api/plans/{plan_id}/finalize` | ✅ | Finalize a plan as active |
| GET | `/api/plans/state/current` | ✅ | Get current learning state (active plan, session) |
| GET | `/api/sessions` | ✅ | Session history |
| POST | `/api/sessions/start` | ✅ | Start a study session |
| PATCH | `/api/sessions/{id}/end` | ✅ | End session → returns focus_score |
| POST | `/api/sessions/{id}/events` | ✅ | Record a focus event (phone_detected/away/sleepy/tab_switch) |
| GET | `/api/quizzes/{topic_id}` | ✅ | Generate/retrieve cached quiz |
| POST | `/api/quizzes/{quiz_id}/attempt` | ✅ | Submit answers, server-graded |
| POST | `/api/quizzes/generate` | ✅ | Rich quiz generation (multi-type, n_questions, time_limit, face_tracking, fullscreen, pdf_source_mode) |
| POST | `/api/quizzes/submit` | ✅ | Rich quiz submission with full per-question results |
| GET | `/api/quizzes/topics/available` | ✅ | Topics the student can be quizzed on |
| GET | `/api/quizzes/history` | ✅ | Student's quiz attempt history |
| GET | `/api/quizzes/topics/{topic_id}/stats` | ✅ | Per-topic performance stats |
| POST | `/api/quizzes/attempts/{attempt_id}/face-tracking-events` | ✅ | Record face tracking event |
| GET | `/api/quizzes/attempts/{attempt_id}/face-tracking-events` | ✅ | Get all face tracking events for attempt |
| GET | `/api/quizzes/attempts/{attempt_id}/face-tracking-summary` | ✅ | Get face tracking summary statistics |
| POST | `/api/doubts` | ✅ | RAG-powered doubt solver |
| GET/POST | `/api/topics/{topic_id}/documents` | ✅ | List / upload study docs for a topic |
| POST | `/api/topics/focus/documents` | ✅ | Upload doc tied to a live session |
| POST | `/api/topics/documents/{document_id}/explain` | ✅ | AI-explain a subtopic from a doc |
| POST | `/api/topics/estimate` | ✅ | AI time/difficulty estimate for a topic |
| GET | `/health` | – | Health check |
| GET | `/docs` | – | Swagger UI |

> The doubt-solver only gives grounded/high-confidence answers for topics
> that have been embedded into ChromaDB (via `ai_service/embeddings` or
> document upload). Otherwise it still answers but with low confidence.

---

## 5. Data model (SQLAlchemy, `app/models/models.py`)

- **User** — email, password_hash, name, role (student/parent/teacher/admin), grade_level, target_exam, parent_id (self-referential for parent↔child), current_plan_id, current_session_id
- **Subject** — name (e.g. Mathematics, Biology)
- **Topic** — belongs to Subject; difficulty (easy/medium/hard); estimated_hours
- **StudyDocument** — belongs to Topic + uploader; stores file path, extracted_text, AI-derived concepts (JSON list), structure (JSON list), difficulty, estimated_hours, processing status
- **StudyPlan** — belongs to User (student); exam_deadline; status (pending/in_progress/completed); is_active (boolean); progress_percentage (0-100)
- **PlanItem** — belongs to StudyPlan + Topic; scheduled_date, duration_minutes, status (pending/done/skipped)
- **StudySession** — belongs to User; optional plan_item/document link; subtopic, explanation_mode, duration_minutes, focus_score, productivity_score
- **FocusEvent** — belongs to StudySession; event_type (phone_detected/away/sleepy/tab_switch); timestamp
- **QuizAttempt** — belongs to User; quiz_id, score, completed_at; **NEW**: status (not_started/in_progress/paused/submitted/completed/cancelled), topic_id, difficulty, question_type, question_count, total_points, percentage, correct_count, incorrect_count, unanswered_count, start_time, time_limit_minutes, question_results (JSON)
- **FaceTrackingEvent** — belongs to QuizAttempt; event_type (face_detected/face_not_detected/multiple_faces/focus_lost/focus_returned); timestamp; duration_seconds; event_metadata (JSON)

## 6. Migrations (`alembic/versions/`, run in this order)

1. `03d484719bd5` — initial schema (users, subjects, topics, study_plans, plan_items)
2. `4ebdbcca4249` — study_sessions + focus_events
3. `1a418bbe8b2c` — quiz_attempts
4. `add_study_documents` — study_documents table
5. `add_learning_session_config` — session config fields
6. `5f90cb866138` — add_persistence_fields (study_plans.is_active, study_plans.progress_percentage, users.current_plan_id, users.current_session_id)
7. `353bb984d035` — add_face_tracking_events (face_tracking_events table for quiz proctoring)

---

## 7. Environment variables (`.env`, copy from `.env.example`)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `sqlite:///./study_companion.db` (dev) or Postgres URL (prod) |
| `REDIS_URL` | value required, connection optional | app silently falls back to in-process cache if unreachable |
| `CHROMA_MODE` | ✅ | `embedded` (default, no server) or `http` |
| `CHROMA_URL` | only if `CHROMA_MODE=http` | default `http://localhost:8001` |
| `JWT_SECRET_KEY` | ✅ | long random string |
| `AI_API_KEY` | ✅ | Groq API key |
| `AI_API_BASE_URL` | default set | `https://api.groq.com/openai/v1` |
| `LLM_MODEL_NAME` | default set | `openai/gpt-oss-120b` |
| `OPENAI_API_KEY` | optional | only for the embedding pipeline |
| `FRONTEND_URL` | optional | CORS origin, default `http://localhost:5173` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | optional | only for `docker-compose.yml` prod stack |

---

## 8. Persistence & Data Recovery

The system implements persistent data storage with automatic state restoration:

### Persistence Features
- **Active Plan Tracking**: Each user can have one "active" study plan (`is_active=true`) that persists across sessions
- **Progress Tracking**: Study plans automatically calculate and store `progress_percentage` (0-100) based on completed items
- **Session State**: Users have `current_plan_id` and `current_session_id` fields to track their active learning state
- **Auto-Restoration**: On login, the system automatically loads the user's active plan and current state via `/api/plans/state/current`
- **Plan Finalization**: Plans must be explicitly "finalized" to become the active plan (prevents accidental activations)

### Data Flow
1. User creates a study plan → stored in SQLite with `is_active=false`
2. User finalizes a plan → `is_active=true`, becomes the active plan, user's `current_plan_id` updated
3. User completes plan items → progress percentage automatically recalculated
4. User logs out → SQLite data persists
5. User logs in → active plan and current state automatically restored
6. Focus sessions automatically use the active plan's items

### Key Endpoints
- `POST /api/plans/{plan_id}/finalize` — Set a plan as the active plan
- `GET /api/plans/active/current` — Get the currently active plan
- `GET /api/plans/state/current` — Get complete current learning state
- Frontend `AuthContext` automatically loads user state on login

---

## 10. Conventions & things an AI editing this repo should know

- **`ai_service/` must stay framework-agnostic** — never import FastAPI or `app.*` inside it. It's designed to be testable/usable standalone.
- Backend business logic lives in `app/services/*`, not in the routers — routers stay thin.
- Schemas in `app/schemas/` mirror routers 1:1 (`auth.py`, `plan.py`, `session.py`, `quiz.py`, `doubt.py`, `documents.py`).
- Frontend API types (`frontend/src/api/types.ts`) should match the backend Pydantic schemas — update both together.
- Tests (`tests/`) run fully offline: SQLite in-memory DB + mocked LLM calls. `tests/test_embeddings.py` and `tests/test_embedding_store.py` are excluded from the default run because they need a real embedding model.
- Focus detection (phone/away/sleepy/tab-switch) runs **client-side** in the browser via `@mediapipe/tasks-vision` (see `frontend/src/hooks/useFocusMonitoring.ts`) — events are POSTed to `/api/sessions/{id}/events`. There is no separate "ML server" for this; it's not part of `ai_service/`.
- `ai_service/` (LLM + RAG + embeddings) is the actual "AI/ML backend" — quiz generation, doubt solving, plan generation, document analysis, topic explanation all flow through it.
- Expected test result: **70 passed** with the excluded files above.
- Seed script (`app/scripts/seed_dev_data.py`) is idempotent — safe to re-run.

---

## 11. How to run it (copy-paste commands for Windows PowerShell)

> **Key insight**: `uvicorn` is NOT on the system PATH — always invoke it as
> `python -m uvicorn`. The `run.txt` file was written for Unix; use the
> corrected commands below on Windows.

### Step 1 — Backend (FastAPI + AI/ML service)
```powershell
# from the repo root
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- API → http://localhost:8000
- Swagger UI → http://localhost:8000/docs
- Health → http://localhost:8000/health

### Step 2 — Frontend (React + Vite)
```powershell
# in a second terminal, from the repo root
npm --prefix frontend install   # only needed once
npm --prefix frontend run dev
```
- Frontend → http://localhost:5173

### Step 3 — Seed data (first time only, idempotent)
```powershell
python app/scripts/seed_dev_data.py
```

### Notes
- No Postgres, Redis, or Chroma server needed for local dev — everything
  falls back gracefully (SQLite / in-process cache / embedded ChromaDB).
- See **`run.txt`** for additional details (Docker/production stack).

---

## 12. Changelog (AI-assisted changes)

| Date (IST) | Change | Reason |
|---|---|---|
| 2026-09-26 | `.env`: `DATABASE_URL` switched from `postgresql+psycopg2://...` → `sqlite:///./study_companion.db` | No Postgres server running locally; `study_companion.db` already exists |
| 2026-09-26 | `.env`: `JWT_SECRET_KEY` set to a valid dev secret (was placeholder `generate_a_long_random_secret`) | App would fail JWT signing with the placeholder |
| 2026-09-26 | Run command corrected to `python -m uvicorn` (not bare `uvicorn`) | `uvicorn` binary is not on the Windows PATH; `python -m uvicorn` always works |
| 2026-09-26 | **Login 500 fix**: ran `python -m alembic upgrade head` to apply migration `5f90cb866138` (`add_persistence_fields`) | SQLite DB was missing `users.current_plan_id` and `users.current_session_id` columns — the ORM model was ahead of the DB schema. **Always run `alembic upgrade head` after switching DB or pulling new migrations.** |
| 2026-09-29 | **Frontend compilation fix**: `PlannerPage.tsx` and `SessionPage.tsx` | Fixed missing state variables, removed unused imports, restored history state and focus hooks for successful `tsc -b && vite build`. |
| 2026-09-29 | **Pydantic v2 modernization**: `app/schemas/documents.py` | Migrated deprecated Pydantic v1 `class Config` to Pydantic v2 `ConfigDict(from_attributes=True)`. |
| 2026-09-29 | **Pytest speed & exclusion fix**: `pytest.ini` and `ai_service/embeddings/embed.py` | Lazy-loaded `SentenceTransformer` inside `_get_model()` and configured `pytest.ini` with test exclusion flags, cutting test discovery & import overhead from 50+ seconds to instant. |
| 2026-09-29 | **Auth endpoint compatibility**: `app/routers/auth.py` | Updated `/api/auth/login` to accept both JSON request payloads and OAuth2 form-urlencoded bodies, enabling all API tests and browser login to work concurrently. |
| 2026-09-29 | **Topic breakdown / generation fix**: `app/core/config.py`, `ai_service/generation/provider.py`, `ai_service/generation/key_manager.py` | Fixed `AI_API_KEY` loading in `Settings`, added key rotation failover without `UnboundLocalError`, stripped key whitespace, and validated `TopicPipeline` with real Groq LLM integration. Total tests passed: **68/68**. |
| 2026-09-29 | **Topic Processing Pipeline & UI Hierarchy**: `TopicPipeline`, `ItemStatus`, `PlannerPage.tsx`, `SessionPage.tsx` | Implemented intent extraction, anti-redundancy caching, and sanitization in `TopicPipeline`. Added `in_progress` item state support. Built 3-part roadmap display (Current Study / Completed / Remaining) in `SessionPage.tsx` and status tabs (All / In Progress / Planned / Completed) with full persistence in `PlannerPage.tsx`. Total tests passed: **70/70**. |
| 2026-09-30 | **Login persistence fix**: `frontend/src/contexts/AuthContext.tsx`, `frontend/src/components/ProtectedRoute.tsx` | Fixed page-refresh redirect-to-login bug. Root cause: `useState(null)` meant the token was `null` for one render before `useEffect` could read `localStorage`, causing `ProtectedRoute` to redirect. Fix: synchronous lazy initializer `useState(() => localStorage.getItem(TOKEN_KEY))` so token and cached `userState` are available on the very first render. Added `isLoading` flag so `ProtectedRoute` shows a spinner instead of redirecting while the server state is being fetched. Frontend build: **0 TypeScript errors**. |
| 2026-10-01 | **Doubt Solver & Quiz Generator Major Upgrade**: Multiple files | **Doubt Solver**: Integrated centralized GroqKeyManager for API key rotation (replaced direct API key usage). **Quiz Generator**: Added face tracking infrastructure (FaceTrackingEvent model, service, API endpoints), full-screen mode with exit detection, quiz status management (not_started/in_progress/paused/submitted), test rules screen, PDF integration (topic_knowledge/pdf_only/topic_pdf modes), enhanced QuizPage UI with proctoring options. **Database**: Added face_tracking_events table (migration 353bb984d035). **Frontend**: Added face tracking UI, fullscreen detection, quiz pause/resume, PDF source mode selection. All features optional by default. See `UPGRADE_SUMMARY.md` for complete details. |