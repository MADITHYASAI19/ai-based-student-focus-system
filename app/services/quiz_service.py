"""
Quiz service — business logic for quiz generation, submission, scoring, and analytics.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.cache import cache_get, cache_set
from app.models.models import Topic, QuizAttempt, PlanItem, Subject, StudyDocument
from app.schemas.quiz import (
    QuizOut,
    QuizQuestion,
    QuizConfig,
    QuizSubmission,
    QuizAttemptOut,
    QuestionResult,
    TopicQuizStats,
    AvailableTopic,
    QUESTION_POINTS,
    normalize_fill_blank,
)
from ai_service.generation.quiz_gen import (
    generate_quiz,
    deserialise_quiz,
    serialise_quiz,
    make_cache_key,
    QuizGenerationError,
)

logger = logging.getLogger(__name__)


class QuizTimeoutError(Exception):
    """Raised when quiz generation times out."""
    pass


# ---------------------------------------------------------------------------
# Available topics (for the topic picker)
# ---------------------------------------------------------------------------

def get_available_topics(student_id: int, db: Session) -> list[AvailableTopic]:
    """Return topics the student has in their study plans."""
    # Join plan_items → topics → subjects for the student's plans
    rows = (
        db.query(Topic, Subject)
        .join(PlanItem, PlanItem.topic_id == Topic.id)
        .join(Subject, Subject.id == Topic.subject_id)
        .filter(
            PlanItem.study_plan.has(student_id=student_id)
        )
        .distinct()
        .all()
    )

    seen: set[int] = set()
    topics: list[AvailableTopic] = []
    for topic, subject in rows:
        if topic.id in seen:
            continue
        seen.add(topic.id)
        topics.append(
            AvailableTopic(
                id=topic.id,
                name=topic.name,
                subject_name=subject.name,
                difficulty=topic.difficulty,
            )
        )
    return topics


# ---------------------------------------------------------------------------
# Quiz generation / cache
# ---------------------------------------------------------------------------

def get_or_generate_quiz(
    topic_id: int,
    difficulty: str,
    db: Session,
    question_types: Optional[list[str]] = None,
    n_questions: int = 5,
    time_limit_minutes: Optional[int] = None,
    face_tracking_enabled: bool = False,
    fullscreen_required: bool = False,
    pdf_source_mode: Optional[str] = None,
) -> QuizOut:
    """Get or generate a quiz for a topic, with cache.

    Raises:
        ValueError: Topic not found or not owned by student.
        QuizGenerationError: AI generation failed.
    """
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise ValueError(f"Topic with id {topic_id} not found")

    subject = db.query(Subject).filter(Subject.id == topic.subject_id).first()
    topic_name = topic.name
    subject_name = subject.name if subject else "General"

    if question_types is None:
        question_types = ["mcq"]

    # Build cache key with PDF mode to differentiate
    cache_suffix = f"_{pdf_source_mode}" if pdf_source_mode else ""
    cache_key = make_cache_key(topic_id, difficulty, question_types, n_questions) + cache_suffix
    cached = cache_get(cache_key)
    if cached:
        try:
            logger.info("Cache hit for %s", cache_key)
            return deserialise_quiz(cached)
        except Exception as e:
            logger.warning("Failed to deserialise cached quiz for %s: %s", cache_key, e)

    # Generate
    logger.info("Generating quiz: topic_id=%s difficulty=%s types=%s n=%s pdf_mode=%s",
                topic_id, difficulty, question_types, n_questions, pdf_source_mode)

    # Retrieve PDF context if needed
    pdf_context = None
    if pdf_source_mode in ("pdf_only", "topic_pdf"):
        # Get the most recent processed document for this topic
        document = (
            db.query(StudyDocument)
            .filter(
                StudyDocument.topic_id == topic_id,
                StudyDocument.status == "completed",
                StudyDocument.extracted_text.isnot(None)
            )
            .order_by(StudyDocument.uploaded_at.desc())
            .first()
        )
        if document and document.extracted_text:
            pdf_context = document.extracted_text
            logger.info(f"Using PDF context from document {document.id} for quiz generation")
        else:
            logger.warning(f"No processed PDF found for topic {topic_id}, falling back to topic knowledge")
            pdf_source_mode = "topic_knowledge"

    try:
        from openai import APITimeoutError
        questions = generate_quiz(
            topic=topic_name,
            difficulty=difficulty,
            n_questions=n_questions,
            question_types=question_types,
            pdf_context=pdf_context,
            pdf_source_mode=pdf_source_mode,
        )
    except ImportError:
        questions = generate_quiz(
            topic=topic_name,
            difficulty=difficulty,
            n_questions=n_questions,
            question_types=question_types,
        )

    total_points = sum(
        (q.points or QUESTION_POINTS.get(q.type, 1.0)) for q in questions
    )

    quiz = QuizOut(
        quiz_cache_key=cache_key,
        topic_id=topic_id,
        topic_name=topic_name,
        difficulty=difficulty,
        question_types=list(set(q.type for q in questions)),
        questions=questions,
        total_points=total_points,
        time_limit_minutes=time_limit_minutes,
        face_tracking_enabled=face_tracking_enabled,
        fullscreen_required=fullscreen_required,
        pdf_source_mode=pdf_source_mode,
    )

    serialized = serialise_quiz(quiz)
    cache_set(cache_key, serialized, ttl_seconds=3600)
    logger.info("Cached quiz for %s", cache_key)

    return quiz


# ---------------------------------------------------------------------------
# Answer evaluation helpers
# ---------------------------------------------------------------------------

def _evaluate_answer(
    question: QuizQuestion,
    student_answer: str,
) -> tuple[bool, float]:
    """Return (is_correct, points_awarded) for a student answer."""
    points_possible = question.points or QUESTION_POINTS.get(question.type, 1.0)
    sa = student_answer.strip()

    if question.type in ("mcq", "true_false"):
        # Exact match (case-insensitive)
        is_correct = sa.lower() == question.correct_answer.strip().lower()

    elif question.type == "fill_blank":
        # Normalized comparison
        is_correct = normalize_fill_blank(sa) == normalize_fill_blank(question.correct_answer)

    elif question.type in ("short_answer", "coding"):
        # Lenient: check if student answer contains key tokens from correct answer
        # (A more sophisticated AI evaluation could be used here)
        correct_tokens = set(question.correct_answer.lower().split())
        student_tokens = set(sa.lower().split())
        if len(correct_tokens) == 0:
            is_correct = False
        else:
            overlap = len(correct_tokens & student_tokens) / len(correct_tokens)
            is_correct = overlap >= 0.4  # 40% token overlap threshold
    else:
        is_correct = sa.lower() == question.correct_answer.strip().lower()

    points_awarded = points_possible if is_correct else 0.0
    return is_correct, points_awarded


# ---------------------------------------------------------------------------
# Rich submission / scoring
# ---------------------------------------------------------------------------

def submit_quiz(
    submission: QuizSubmission,
    student_id: int,
    db: Session,
) -> QuizAttemptOut:
    """Score a rich quiz submission and persist the attempt.

    Raises:
        ValueError: Quiz not found in cache.
    """
    # Load quiz from cache
    cached = cache_get(submission.quiz_cache_key)
    if cached:
        try:
            quiz = deserialise_quiz(cached)
        except Exception:
            quiz = None
    else:
        quiz = None

    # Fallback: regenerate (shouldn't normally happen)
    if quiz is None:
        logger.warning("Cache miss for %s — regenerating", submission.quiz_cache_key)
        topic = db.query(Topic).filter(Topic.id == submission.topic_id).first()
        if not topic:
            raise ValueError(f"Topic {submission.topic_id} not found")
        quiz = get_or_generate_quiz(
            topic_id=submission.topic_id,
            difficulty=submission.difficulty,
            db=db,
            question_types=submission.question_types,
            n_questions=submission.n_questions,
        )

    # Build answer lookup: question_id → student answer
    answer_map: dict[str, str] = {a.question_id: a.answer for a in submission.answers}

    # Score every question
    question_results: list[QuestionResult] = []
    correct_count = 0
    total_points_earned = 0.0
    total_points_possible = 0.0
    incorrect_count = 0
    unanswered_count = 0

    for q in quiz.questions:
        qid = q.id or "?"
        student_ans = answer_map.get(qid, "").strip()
        points_possible = q.points or QUESTION_POINTS.get(q.type, 1.0)
        total_points_possible += points_possible

        if not student_ans:
            unanswered_count += 1
            qr = QuestionResult(
                question_id=qid,
                question_text=q.question_text,
                question_type=q.type,
                student_answer="",
                correct_answer=q.correct_answer,
                is_correct=False,
                points_awarded=0.0,
                points_possible=points_possible,
                explanation=q.explanation,
            )
        else:
            is_correct, pts = _evaluate_answer(q, student_ans)
            if is_correct:
                correct_count += 1
            else:
                incorrect_count += 1
            total_points_earned += pts

            qr = QuestionResult(
                question_id=qid,
                question_text=q.question_text,
                question_type=q.type,
                student_answer=student_ans,
                correct_answer=q.correct_answer,
                is_correct=is_correct,
                points_awarded=pts,
                points_possible=points_possible,
                explanation=q.explanation,
            )
        question_results.append(qr)

    # Compute final score as percentage
    percentage = round((total_points_earned / total_points_possible) * 100.0, 2) if total_points_possible > 0 else 0.0

    # Parse start_time
    start_time_dt: datetime | None = None
    if submission.start_time:
        try:
            start_time_dt = datetime.fromisoformat(submission.start_time.replace("Z", "+00:00"))
        except Exception:
            pass

    # Persist
    attempt = QuizAttempt(
        student_id=student_id,
        quiz_id=submission.topic_id,         # quiz_id == topic_id (backward compat)
        score=percentage,
        topic_id=submission.topic_id,
        difficulty=submission.difficulty,
        question_type=",".join(submission.question_types),
        question_count=len(quiz.questions),
        total_points=total_points_earned,
        percentage=percentage,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        unanswered_count=unanswered_count,
        start_time=start_time_dt,
        time_limit_minutes=submission.time_limit_minutes,
        question_results=[qr.model_dump() for qr in question_results],
        completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return _attempt_to_out(attempt)


# ---------------------------------------------------------------------------
# Legacy submission (backward compat with existing tests)
# ---------------------------------------------------------------------------

def record_quiz_attempt(
    quiz_id: int,
    student_id: int,
    answers: dict[str, str],
    db: Session,
) -> QuizAttempt:
    """Score submitted answers (legacy dict format) and record attempt."""
    quiz: QuizOut | None = None
    for diff in ["easy", "medium", "hard"]:
        cache_key = make_cache_key(quiz_id, diff)
        cached = cache_get(cache_key)
        if cached:
            try:
                quiz = deserialise_quiz(cached)
                break
            except Exception:
                continue

    if quiz is None:
        topic = db.query(Topic).filter(Topic.id == quiz_id).first()
        if not topic:
            raise ValueError(f"Quiz/topic with id {quiz_id} not found")
        quiz = get_or_generate_quiz(topic_id=quiz_id, difficulty="medium", db=db)

    total_questions = len(quiz.questions)
    correct_count = 0
    for idx, q in enumerate(quiz.questions):
        student_ans = answers.get(str(idx))
        if student_ans is None and q.id is not None:
            student_ans = answers.get(str(q.id))
        if student_ans and student_ans.strip().lower() == q.correct_answer.strip().lower():
            correct_count += 1

    calculated_score = round((correct_count / total_questions) * 100.0, 2) if total_questions else 0.0

    attempt = QuizAttempt(
        student_id=student_id,
        quiz_id=quiz_id,
        score=calculated_score,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


# ---------------------------------------------------------------------------
# Topic stats and history
# ---------------------------------------------------------------------------

def get_topic_quiz_stats(topic_id: int, student_id: int, db: Session) -> TopicQuizStats:
    """Return aggregated quiz stats for a topic."""
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise ValueError(f"Topic {topic_id} not found")

    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == student_id,
            QuizAttempt.quiz_id == topic_id,
        )
        .all()
    )

    if not attempts:
        return TopicQuizStats(
            topic_id=topic_id,
            topic_name=topic.name,
            attempt_count=0,
            average_score=0.0,
            best_score=0.0,
            total_questions_attempted=0,
            total_correct=0,
        )

    scores = [a.score for a in attempts]
    total_correct = sum(a.correct_count or 0 for a in attempts)
    total_questions = sum(a.question_count or 0 for a in attempts)

    return TopicQuizStats(
        topic_id=topic_id,
        topic_name=topic.name,
        attempt_count=len(attempts),
        average_score=round(sum(scores) / len(scores), 2),
        best_score=round(max(scores), 2),
        total_questions_attempted=total_questions,
        total_correct=total_correct,
    )


def get_quiz_history(student_id: int, db: Session, limit: int = 20) -> list[QuizAttemptOut]:
    """Return the student's quiz attempt history (newest first)."""
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.student_id == student_id)
        .order_by(desc(QuizAttempt.completed_at))
        .limit(limit)
        .all()
    )
    return [_attempt_to_out(a) for a in attempts]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _attempt_to_out(attempt: QuizAttempt) -> QuizAttemptOut:
    """Convert ORM QuizAttempt to QuizAttemptOut schema."""
    return QuizAttemptOut(
        id=attempt.id,
        student_id=attempt.student_id,
        quiz_id=attempt.quiz_id,
        topic_id=attempt.topic_id,
        difficulty=attempt.difficulty,
        question_type=attempt.question_type,
        score=attempt.score,
        total_points=attempt.total_points,
        correct_count=attempt.correct_count,
        incorrect_count=attempt.incorrect_count,
        unanswered_count=attempt.unanswered_count,
        question_results=attempt.question_results,
        completed_at=attempt.completed_at.isoformat() if attempt.completed_at else None,
        start_time=attempt.start_time.isoformat() if attempt.start_time else None,
        time_limit_minutes=attempt.time_limit_minutes,
    )
