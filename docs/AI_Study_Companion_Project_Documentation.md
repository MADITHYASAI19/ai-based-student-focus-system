# AI Study Companion — Project Documentation

**AI-Powered Adaptive Study, Focus & Career-Readiness Platform**

---

## 1. Project Overview

The **AI Study Companion** is a web and mobile platform that helps students plan their study time, stay focused during sessions, and turn that behavior into personalized practice, doubt-solving, interview prep, and career guidance — all connected through one continuously-updated model of how each student actually learns.

### 1.1 Problem Statement
Most study tools solve exactly one stage and stop. A focus blocker blocks distractions but doesn't plan anything. A planner tracks tasks but has no idea whether the student actually focused. A quiz app tests recall but isn't connected to what was studied that day. None of them close the loop between *how* a student studies and what they can do next with that information.

### 1.2 Solution
A platform that combines:
- **Adaptive study planning** that auto-schedules topics against deadlines and re-optimizes as the student falls behind or ahead.
- **Opt-in, on-device focus tracking** that produces a focus score and productivity score per session — without raw video ever leaving the device.
- **AI-generated practice** (quizzes) tied directly to the topic just studied.
- **A RAG-based doubt solver** grounded in the student's own uploaded notes, with source citations.
- **Interview prep, career guidance, and verified certification** that build on the accumulated study history rather than starting from zero.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend (Web)** | React.js (Vite), Tailwind CSS | UI, planner and dashboard views |
| **Frontend (Mobile)** | React Native | Shared logic with web app; on-device inference |
| **On-device CV** | MediaPipe, TensorFlow.js | Face/posture/phone detection — runs locally, never uploads video |
| **Backend** | Node.js + Express.js (or FastAPI) | REST API, business logic, service orchestration |
| **Relational DB** | PostgreSQL | Users, plans, sessions, quizzes, gamification |
| **Document DB** | MongoDB | Flexible content: question banks, algorithm-style metadata |
| **Vector DB** | ChromaDB / Pinecone | Embeddings for the RAG doubt solver |
| **Cache / Realtime** | Redis | Session state, leaderboards, event queueing |
| **AI Layer** | Claude/OpenAI API (LLM), Whisper (speech-to-text) | Quiz generation, doubt solving, interview scoring |
| **Auth** | JWT + bcrypt | Secure login/signup, role-based access |
| **Event Bus** | Redis Streams / Kafka | Decouples services (e.g. session-completed → analytics + XP) |
| **Object Storage** | S3-compatible storage | Uploaded notes, certificates, interview recordings (if consented) |
| **Deployment** | Docker, Vercel/Netlify (frontend), Render/AWS (backend), Managed Postgres/Redis | Hosting & CI/CD |
| **Testing** | Jest, React Testing Library, Supertest | Unit & integration testing |

---

## 3. Core Features

1. **Adaptive Study Planner**
   - Topic, deadline, and available-hours input with automatic schedule generation.
   - Constraint-based re-optimization when the student falls behind or gets ahead.

2. **Session Focus Tracking**
   - Opt-in, on-device monitoring (posture, phone use, attention) via MediaPipe/TensorFlow.js.
   - Produces a per-session focus score and productivity score; only derived signals are sent to the server.

3. **AI Quiz Generator**
   - Auto-generates MCQ / short-answer / coding questions tied to the topic just studied.
   - Human-reviewed question bank as fallback/seed content.

4. **RAG Doubt Solver**
   - Answers grounded strictly in the student's own uploaded notes/PDFs, with source citations.
   - "Explain like I actually don't get it" mode — switches explanation style (analogy, visual, worked example) on repeated re-asks of the same concept.

5. **Gamification**
   - XP, streaks, and badges tied to real study behavior.
   - Group accountability rooms (3–5 person study pods) with an AI moderator that nudges inactive members.

6. **AI Mock Interviews**
   - Voice-based technical/HR/subject interviews.
   - Speech-to-text + LLM scoring against a rubric, with directional (not certified) confidence feedback.

7. **Career Guidance Engine**
   - Rule-based path/certification/internship suggestions from accumulated performance and interests, evolving as more outcome data accumulates.

8. **Parent / Teacher Dashboards**
   - Aggregated, privacy-respecting summaries — never raw session footage or minute-by-minute logs.

9. **Secure Exam Mode & Verified Certification**
   - Locked-down assessment environment; shareable, QR-verified skill certificates.

10. **Admin Panel**
    - Manage subjects, topics, difficulty tags, and question banks.
    - View platform usage analytics.

---

## 4. System Architecture

```
┌─────────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  React / React Native│  REST  │   API Gateway          │        │   PostgreSQL         │
│  Client (on-device CV)│◄─────►│  (Auth, rate limiting,  │◄─────►│  MongoDB              │
│                       │        │   routing)              │        │  Redis / Vector DB    │
└──────────┬───────────┘        └───────────┬───────────┘        └────────────────────┘
           │                                 │
           │                     ┌───────────┴────────────────────────────┐
           │                     │              Microservices              │
           │                     │  Planner · Session & Focus · Quiz ·     │
           │                     │  Interview · Gamification · Certificate │
           │                     │  · Analytics · Notification             │
           │                     └───────────┬────────────────────────────┘
           │                                 │
           │        AI / Doubt-Solver API    │
           └────────────────►┌───────────────▼───────────────┐
                              │   AI Service (LLM API layer)   │
                              │  RAG doubt solver · quiz gen · │
                              │  interview scoring              │
                              └─────────────────────────────────┘
```

Event bus (Redis Streams/Kafka) connects services for cross-cutting updates — e.g. a `session_completed` event triggers both an analytics refresh and an XP grant — without services calling each other directly.

---

## 5. Folder Structure

```
ai-study-companion/
├── client/                       # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Planner/          # Schedule + plan-item views
│   │   │   ├── FocusSession/     # On-device CV + session controls
│   │   │   ├── QuizEngine/       # Quiz UI + scoring
│   │   │   ├── DoubtChat/        # RAG doubt-solver chat panel
│   │   │   └── Dashboard/        # Progress, streaks, weekly review
│   │   ├── pages/
│   │   ├── store/                # Redux Toolkit / Zustand
│   │   ├── services/             # API calls (axios)
│   │   └── utils/
│   └── package.json
│
├── mobile/                       # React Native app (shares logic with client/)
│
├── server/                       # Node/Express (or FastAPI) backend
│   ├── config/                   # DB connection, env config
│   ├── models/                   # Schemas
│   │   ├── User.js
│   │   ├── StudyPlan.js
│   │   ├── Session.js
│   │   └── Quiz.js
│   ├── controllers/
│   ├── routes/
│   ├── middleware/                # auth, error handling
│   ├── services/
│   │   ├── plannerService.js     # Adaptive scheduling logic
│   │   ├── focusService.js       # Focus-signal ingestion
│   │   └── aiService.js          # LLM/RAG integration
│   └── server.js
│
├── docs/
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## 6. Database Schema

### User
```js
{
  name: String,
  email: String,
  password: String (hashed),
  role: "student" | "parent" | "teacher" | "admin",
  gradeLevel: String,
  targetExam: String,
  parentId: ObjectId | null,
  createdAt: Date
}
```

### StudyPlan / PlanItem
```js
{
  studentId: ObjectId,
  examDeadline: Date,
  status: "active" | "completed",
  items: [{
    topicId: ObjectId,
    scheduledDate: Date,
    durationMinutes: Number,
    status: "pending" | "done" | "skipped"
  }]
}
```

### StudySession
```js
{
  studentId: ObjectId,
  planItemId: ObjectId | null,
  startedAt: Date,
  endedAt: Date,
  focusScore: Number,
  productivityScore: Number,
  focusEvents: [{ type: "phone_detected" | "away" | "tab_switch", timestamp: Date }]
}
```

### Quiz / QuizAttempt
```js
{
  topicId: ObjectId,
  difficulty: "easy" | "medium" | "hard",
  questions: [{ text: String, type: "mcq" | "short_answer" | "coding", correctAnswer: String }],
  attempts: [{ studentId: ObjectId, score: Number, completedAt: Date }]
}
```

### DoubtQuery
```js
{
  studentId: ObjectId,
  questionText: String,
  sourceDocumentId: ObjectId | null,
  answerText: String,
  createdAt: Date
}
```

---

## 7. API Endpoints (Sample)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/plans/:studentId` | Get a student's current study plan |
| POST | `/api/plans/:studentId/regenerate` | Re-optimize plan against progress/deadline |
| POST | `/api/sessions/start` | Start a study session (focus tracking opt-in) |
| PATCH | `/api/sessions/:id/end` | End session, compute focus/productivity score |
| GET | `/api/quizzes/:topicId` | Get or generate a quiz for a topic |
| POST | `/api/quizzes/:id/attempt` | Submit and score a quiz attempt |
| POST | `/api/ai/doubt` | Ask the RAG doubt solver a question |
| POST | `/api/interviews/start` | Start an AI mock interview session |
| GET | `/api/users/:id/progress` | Fetch a student's learning progress |
| GET | `/api/parent/:studentId/summary` | Aggregated, privacy-respecting summary for parents/teachers |

---

## 8. AI Feature Workflow (Doubt Solver Example)

1. Student uploads notes/PDFs; content is chunked and embedded into the vector DB, with source text mirrored in PostgreSQL.
2. Student asks a question in the doubt-solver chat.
3. Backend retrieves the most relevant chunks from the vector DB.
4. The LLM answers **grounded strictly in those chunks**, with citations back to the source document.
5. Low-similarity retrievals are flagged as low-confidence rather than answered outright.
6. If the same concept is re-asked repeatedly, the explanation strategy switches (analogy → visual → worked example) instead of repeating itself.

---

## 9. Installation & Setup

```bash
# Clone repository
git clone <repo-url>
cd ai-study-companion

# Install dependencies
cd client && npm install
cd ../server && npm install

# Configure environment variables
cp .env.example .env
# Add Postgres URI, Mongo URI, JWT secret, AI API key

# Run development servers
cd server && npm run dev
cd client && npm run dev
```

### Environment Variables
```
POSTGRES_URI=
MONGO_URI=
JWT_SECRET=
AI_API_KEY=
VECTOR_DB_URL=
PORT=5000
CLIENT_URL=http://localhost:5173
```

---

## 10. Future Scope

- Course marketplace for third-party notes and practice sheets.
- Personalized AI mentor chatbot surfacing weekly trends automatically.
- LMS / Google Classroom integrations for institutions.
- Spaced-repetition retention engine (SM-2/FSRS) layered on top of quiz history.
- Deeper career-outcome personalization as more student data accumulates.

---

## 11. Team & Contribution Guidelines

- Follow Git branching strategy: `main`, `dev`, `feature/*`.
- Use ESLint + Prettier for consistent code style.
- Write unit tests for all new controllers and components.
- Document new services and schema changes in `docs/`.
- Any feature touching focus tracking or student data must note its privacy handling (on-device vs. server) in the PR description.

---

*This document serves as the foundational reference for development, onboarding, and future contributions to the AI Study Companion project.*
