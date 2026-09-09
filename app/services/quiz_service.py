import logging
from typing import Optional

from sqlalchemy.orm import Session
from openai import APITimeoutError

from app.core.cache import cache_get, cache_set
from app.models.models import Topic, QuizAttempt
from app.schemas.quiz import QuizOut
from ai_service.generation.quiz_gen import (
    generate_quiz, 
    deserialise_quiz, 
    serialise_quiz,
    QuizGenerationError
)

logger = logging.getLogger(__name__)


class QuizTimeoutError(Exception):
    """Raised when quiz generation times out."""
    pass


def get_or_generate_quiz(topic_id: int, difficulty: str, db: Session) -> QuizOut:
    """Get or generate a quiz for a topic, with Redis caching.
    
    Args:
        topic_id: ID of the topic to generate quiz for
        difficulty: Difficulty level (easy, medium, hard)
        db: Database session
        
    Returns:
        QuizOut: The quiz object
        
    Raises:
        ValueError: If topic not found
        QuizTimeoutError: If LLM call times out
        QuizGenerationError: If quiz generation fails after retries
        Exception: If quiz generation fails (logged, then propagated)
    """
    # Look up the topic
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise ValueError(f"Topic with id {topic_id} not found")
    
    # Check Redis cache
    cache_key = f"quiz:{topic_id}:{difficulty}"
    cached = cache_get(cache_key)
    if cached:
        try:
            logger.info(f"Cache hit for {cache_key}")
            return deserialise_quiz(cached)
        except Exception as e:
            logger.warning(f"Failed to deserialize cached quiz for {cache_key}: {e}")
    
    # Generate new quiz
    try:
        logger.info(f"Generating quiz for topic_id={topic_id}, difficulty={difficulty}")
        questions = generate_quiz(topic.name, difficulty, n_questions=5)
        quiz = QuizOut(topic_id=topic_id, difficulty=difficulty, questions=questions)
        
        # Cache with 1-hour TTL
        serialized = serialise_quiz(quiz)
        cache_set(cache_key, serialized, ttl_seconds=3600)
        logger.info(f"Cached quiz for {cache_key}")
        
        return quiz
    except QuizGenerationError as e:
        logger.error(f"Quiz generation failed after retries for topic_id={topic_id}: {e}")
        raise  # Re-raise QuizGenerationError for router to handle
    except APITimeoutError as e:
        logger.error(f"Quiz generation timed out for topic_id={topic_id}: {e}")
        raise QuizTimeoutError("AI service took too long, please try again") from e
    except Exception as e:
        logger.error(f"Failed to generate quiz for topic_id={topic_id}, difficulty={difficulty}: {e}")
        raise


def record_quiz_attempt(
    quiz_id: int,
    student_id: int,
    answers: dict[str, str],
    db: Session,
) -> QuizAttempt:
    """Score submitted answers against stored/cached quiz questions and record attempt."""
    # Find cached quiz across difficulties for this topic/quiz_id
    quiz = None
    for diff in ["easy", "medium", "hard"]:
        cache_key = f"quiz:{quiz_id}:{diff}"
        cached = cache_get(cache_key)
        if cached:
            try:
                quiz = deserialise_quiz(cached)
                break
            except Exception:
                continue

    if not quiz:
        # Fallback to topic query and generate or use default
        topic = db.query(Topic).filter(Topic.id == quiz_id).first()
        if not topic:
            raise ValueError(f"Quiz/topic with id {quiz_id} not found")
        quiz = get_or_generate_quiz(topic_id=quiz_id, difficulty="medium", db=db)

    # Score answers
    total_questions = len(quiz.questions)
    if total_questions == 0:
        calculated_score = 0.0
    else:
        correct_count = 0
        for idx, q in enumerate(quiz.questions):
            # Check answer submitted by index string (e.g., "0", "1") or by id string
            student_ans = answers.get(str(idx))
            if student_ans is None and q.id is not None:
                student_ans = answers.get(str(q.id))

            if student_ans and student_ans.strip().lower() == q.correct_answer.strip().lower():
                correct_count += 1

        calculated_score = round((correct_count / total_questions) * 100.0, 2)

    attempt = QuizAttempt(
        student_id=student_id,
        quiz_id=quiz_id,
        score=calculated_score,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt
