# AI Study Companion — Technical Architecture & Schema

## System Architecture Overview

A microservices architecture behind a single API gateway, with one critical design principle: **raw webcam video never leaves the device.** Face/posture/phone detection runs client-side (browser via MediaPipe/TensorFlow.js, or on-device on mobile); only derived signals — a focus score, a distraction event timestamp — are sent to the backend. This is both a cost optimization (no video streaming/storage bill) and the single biggest thing that makes the privacy story credible.

**Layers:**
- **Client**: React web app, mobile app (React Native or Flutter), running on-device CV inference
- **API Gateway**: Auth, rate limiting, routing to services
- **Microservices**: one per domain (below)
- **Event bus**: Redis Streams or Kafka for cross-service events (e.g., `session_completed` triggers analytics update + XP grant, without services calling each other directly)
- **Data layer**: PostgreSQL (core relational data), MongoDB (flexible content like question banks), Vector DB (RAG embeddings), Redis (cache, leaderboards, session state), S3-compatible object storage (documents, certificates)

See the accompanying architecture diagram for the full component map.

---

## Microservices Breakdown

| Service | Responsibility | Primary datastore |
|---|---|---|
| **Auth Service** | Login, roles (student/parent/teacher), OAuth for Classroom/LMS | PostgreSQL |
| **Planner Service** | Goal input, plan generation/re-optimization | PostgreSQL |
| **Session & Focus Service** | Receives derived focus signals, session start/stop, distraction events | PostgreSQL + Redis |
| **Quiz Service** | Generates and grades MCQs/short-answer/coding questions | MongoDB (question bank) + PostgreSQL (attempts) |
| **Interview Service** | Voice-based mock interviews, scoring | PostgreSQL, S3 (recordings if consented) |
| **Doubt Solver (RAG) Service** | Answers questions grounded in uploaded notes/PDFs | Vector DB + S3 |
| **Gamification Service** | XP, streaks, badges, leaderboards | Redis + PostgreSQL |
| **Marketplace/Payments Service** | Courses, transactions, subscriptions | PostgreSQL |
| **Certification Service** | Issues and verifies certificates (QR code) | PostgreSQL + S3 |
| **Analytics Service** | Aggregates cross-service data for dashboards | PostgreSQL + MongoDB (read replicas) |
| **Notification Service** | Reminders, alerts to student/parent | Redis queue |

Each service owns its own tables/collections — no service reaches directly into another's database. Cross-service reads go through the event bus or internal APIs, which keeps you able to scale or even rewrite individual services later without a rewrite cascade.

---

## Database Schema

Core relational schema (PostgreSQL). Simplified to key tables and relationships — expand fields as needed per service.

```sql
-- Identity
users (id, email, password_hash, role ENUM('student','parent','teacher','admin'), created_at)
students (id, user_id FK, grade_level, target_exam, parent_id FK NULLABLE)
parent_links (id, parent_user_id FK, student_id FK)

-- Study content
subjects (id, name)
topics (id, subject_id FK, name, difficulty ENUM('easy','medium','hard'), estimated_hours)

-- Planning
study_plans (id, student_id FK, exam_deadline, generated_at, status)
plan_items (id, plan_id FK, topic_id FK, scheduled_date, duration_minutes, status ENUM('pending','done','skipped'))

-- Sessions & focus
study_sessions (id, student_id FK, plan_item_id FK NULLABLE, started_at, ended_at, focus_score, productivity_score)
focus_events (id, session_id FK, event_type ENUM('phone_detected','away','sleepy','tab_switch'), timestamp)

-- Assessment
quizzes (id, topic_id FK, difficulty, generated_at)
quiz_questions (id, quiz_id FK, question_text, type ENUM('mcq','short_answer','coding'), correct_answer)
quiz_attempts (id, student_id FK, quiz_id FK, score, completed_at)

-- Interviews
interview_sessions (id, student_id FK, type ENUM('technical','hr','subject'), started_at)
interview_feedback (id, interview_session_id FK, confidence_score, accuracy_score, communication_score, notes)

-- Doubt solving
doubt_queries (id, student_id FK, question_text, source_document_id FK NULLABLE, answer_text, created_at)
documents (id, student_id FK, file_url, uploaded_at)  -- embeddings stored separately in vector DB, keyed by document_id

-- Gamification
xp_transactions (id, student_id FK, amount, reason, created_at)
badges (id, student_id FK, badge_type, earned_at)
streaks (id, student_id FK, current_streak, longest_streak, last_active_date)

-- Marketplace & certification
courses (id, title, price, creator_id)
enrollments (id, student_id FK, course_id FK, enrolled_at, progress_pct)
certificates (id, student_id FK, course_id FK, issued_at, verification_code)

-- Billing
subscriptions (id, user_id FK, plan_type, status, renews_at)
```

**Notes:**
- `focus_events` will be your highest-volume table by far — consider partitioning by month once you're past MVP scale.
- Embeddings for the RAG doubt-solver don't belong in Postgres; store them in a vector DB (Pinecone or self-hosted ChromaDB), keyed by `document_id`, with the source text/metadata mirrored in Postgres for joins.

---

## AI/ML Model Mapping by Feature

| Feature | Suggested approach | Notes |
|---|---|---|
| Distraction/posture/phone detection | MediaPipe Face Mesh + a lightweight custom classifier (or YOLOv8-nano for phone detection), run on-device | Avoid a heavy custom CNN from scratch initially — MediaPipe's pretrained models cover most of this out of the box |
| Study pattern / performance forecasting | Start with simple statistical models (moving averages, linear regression on session history) before reaching for LSTM | An LSTM needs volumes of per-student time-series data you won't have in year one; simpler models will outperform an undertrained neural net |
| Adaptive study plan generation | Constraint-based scheduling (greedy/heuristic optimization: deadline, difficulty, available hours) rather than reinforcement learning at first | RL sounds impressive but needs a reward signal and huge amounts of interaction data you won't have yet; a well-tuned heuristic scheduler will feel "smart" to users immediately |
| Retention/forgetting prediction | Spaced-repetition algorithms (SM-2 or the newer FSRS) | These are proven, lightweight, and don't require training your own model |
| Quiz generation | LLM (GPT/Claude/Llama) prompted with topic + difficulty + source material | Keep a human-reviewed question bank as fallback/seed content for reliability |
| Doubt solver | RAG: embed uploaded notes/PDFs into a vector DB, retrieve relevant chunks, answer via LLM grounded in those chunks | Always show source citations; flag low-similarity retrievals as "I'm not fully sure" |
| Interview evaluation | Whisper for speech-to-text, LLM for content/accuracy scoring against a rubric, a separate lightweight prosody model (e.g., pitch/pace features) for confidence estimation | Don't overclaim precision on "confidence detection" — frame scores as directional feedback, not a certified assessment |
| OCR for handwritten notes | Existing OCR APIs (Google Vision, or open-source TrOCR) rather than training your own | Handwriting OCR is a solved problem; building your own model here is wasted engineering time |
| Career guidance | Rule-based recommendation initially (skills/interests → career path mapping table), evolving into a learned recommender once you have enough student-outcome data | Don't oversell this as "AI-powered" until you actually have outcome data to learn from |

---

## Recommended Tech Stack (with adjustments to your list)

Your original stack is solid. A few adjustments worth considering:

- **Frontend**: React + Tailwind is fine; consider **Next.js** over plain React if you'll have a marketing/landing site alongside the app (SEO matters for organic acquisition in EdTech).
- **Mobile**: not in your original list, but you need one — students study on phones. **React Native** lets you share logic with your React web app.
- **Backend**: FastAPI + PostgreSQL + Redis + Celery — good choices, keep them.
- **Event bus**: add **Redis Streams** (simpler) or Kafka (if you're confident you'll need that scale) for the cross-service events described above — this keeps services decoupled as you add more of them.
- **Managed infra early on**: before you have funding/ops headcount, use managed Postgres (Neon/Supabase) and managed Redis (Upstash) instead of self-hosting on Kubernetes from day one. Move to self-managed K8s once you have real scale problems, not before.
- **Vector DB**: ChromaDB self-hosted is fine for MVP; move to Pinecone if you need managed scale later.
- **CV inference**: MediaPipe + TensorFlow.js for on-device — avoids the cost and privacy liability of server-side video processing entirely.

---

## Complete User Flow

1. **Onboarding**: student signs up → enters subjects, exam, deadline, available hours, goals
2. **Plan generation**: Planner Service generates an initial daily/weekly schedule
3. **Study session**: student starts a session → optional focus monitoring begins (on-device, explicit opt-in) → session tracked in real time
4. **Session end**: focus score, productivity score calculated → plan auto-adjusts if behind/ahead
5. **Post-session assessment**: quiz auto-generated on the topic just studied → attempt scored
6. **Gamification update**: XP awarded, streak updated, badges checked
7. **Doubt resolution** (as needed, any time): student uploads notes/asks a question → RAG-grounded answer returned
8. **Weekly review**: Analytics Service surfaces trends (focus heatmap, weak subjects, retention estimate) → mentor chatbot suggests next actions
9. **Parent/teacher view** (if linked): aggregated, privacy-respecting summary — not raw session footage or minute-by-minute logs
10. **Milestone events**: course completion → interview practice → certification issued with QR verification
11. **Career stage**: once enough data exists, career guidance engine suggests paths/certifications/internships based on accumulated performance and interests
