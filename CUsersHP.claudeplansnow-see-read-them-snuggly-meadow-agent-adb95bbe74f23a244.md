# Implementation Plan: AI-Based Study Platform Improvements

## Overview
This plan outlines the improvements to the processing pipeline, API key management, UI hierarchy, and overall reliability of the AI-based study platform.

## 1. Improved Processing Pipeline
**Goal**: Replace basic `json.loads()` with a robust pipeline for structured topic generation.

### Steps:
1.  **Create `ai_service/generation/pipeline.py`**: Implement a new pipeline service.
    - **Input Cleaning**: Use `ai_service/preprocessing/cleaner.py` to sanitize raw user input.
    - **Intent Extraction**: LLM call to determine if the input is a list of topics, a syllabus, or a general request.
    - **Structured Topic Generation**: 
        - Update prompt in `plan_gen.py` to support hierarchical topics (Topic $\rightarrow$ Subtopics).
        - Require a strict JSON schema.
    - **Validation**: Pydantic model to validate the LLM response.
    - **Cleaning & Normalization**: 
        - Post-process topic names to remove markdown (e.g., `**`, `#`), numbering (e.g., `1.`, `a)`), and AI chatter.
    - **DB Storage**: Integrate with `app/services/plan_service.py`.
2.  **Modify `ai_service/generation/plan_gen.py`**: Update `generate_topic_breakdown` to use the new pipeline.
3.  **Update `app/routers/plans.py`**: Update `/breakdown` endpoint to handle the new structured output.

## 2. API Key Load Distribution
**Goal**: Support multiple Groq keys with rotation and failover.

### Steps:
1.  **Update `app/core/config.py`**:
    - Replace `AI_API_KEY: str` with a mechanism to load all `GROQ_API_KEY_*` variables.
    - Add `GROQ_KEYS: list[str]` to `Settings`.
2.  **Create `ai_service/generation/key_manager.py`**:
    - Implement `APIKeyManager` class.
    - **Rotation**: Round-robin selection of keys.
    - **Failover**: If a key returns a 429 (Rate Limit) or 5xx error, mark it as "cooling down" and try the next key.
    - **Retry Logic**: Automatic retry with a different key.
3.  **Modify `ai_service/generation/provider.py`**:
    - Update `get_ai_client()` to request a key from `APIKeyManager` instead of using a static cached setting.
    - Refactor `complete_json` and `complete_text` to use the manager's retry/failover logic.

## 3. UI Improvements
**Goal**: Improve visual hierarchy in Planner and Session pages.

### Steps:
1.  **`frontend/src/pages/PlannerPage.tsx`**:
    - **Sections**: Split the plan items list into three distinct sections:
        - **Planned**: Items with status `pending`.
        - **In Progress**: The currently active item (if applicable).
        - **Completed**: Items with status `done` or `skipped` (collapsed by default or visually dimmed).
    - **Visuals**: Replace status dots with clear icons ($\checkmark$ for done, $\circ$ for pending, $\bullet$ for in-progress).
2.  **`frontend/src/pages/SessionPage.tsx`**:
    - **Focus Session Hierarchy**:
        - **Current Study**: Highlight the active Topic/Subtopic/Focus in a prominent "Hero" section.
        - **Next Up**: Show the immediate next item.
        - **Completed/Remaining**: Separate lists with visual distinction.
    - **Hierarchy**: Use indentation for subtopics if implemented in the pipeline.

## 4. Reliability & Efficiency
**Goal**: Reduce redundant AI calls and improve error handling.

### Steps:
1.  **Redundancy Check**:
    - In `app/routers/plans.py` or `plan_service.py`, implement a hash-based check (e.g., SHA-256 of raw input) to see if a similar breakdown was generated recently for the user.
2.  **Error Handling**:
    - Implement a "JSON repair" utility in `ai_service/generation/provider.py` (e.g., using `regex` or `json_repair` library) to handle slightly malformed AI responses.
    - Improve HTTP error responses from the backend to the frontend.
3.  **Persistence**:
    - Ensure all intermediate states of the pipeline are logged or stored if necessary for recovery.

## Verification Strategy
- **Backend Tests**: 
    - Create a test suite in `tests/test_pipeline.py` to verify input cleaning $\rightarrow$ structured output.
    - Simulate rate-limiting to verify `APIKeyManager` rotation.
- **Frontend Tests**:
    - Manual verification of the "Planned/In-Progress/Completed" sections in `PlannerPage`.
    - Verify the "Current Study" hierarchy in `SessionPage`.
- **End-to-End**:
    - Flow: Raw Text $\rightarrow$ `/breakdown` $\rightarrow$ structured plan $\rightarrow$ `PlannerPage` $\rightarrow$ `SessionPage`.

### Critical Files for Implementation
- `app/core/config.py`
- `ai_service/generation/provider.py`
- `ai_service/generation/plan_gen.py`
- `frontend/src/pages/PlannerPage.tsx`
- `frontend/src/pages/SessionPage.tsx`
EOF`
