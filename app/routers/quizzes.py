import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.quiz import QuizOut
from app.services.quiz_service import get_or_generate_quiz, QuizTimeoutError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{topic_id}", response_model=QuizOut, status_code=status.HTTP_200_OK)
def get_quiz(
    topic_id: int,
    difficulty: str = Query(default="medium"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve a generated quiz for a given topic ID with caching."""
    try:
        return get_or_generate_quiz(topic_id, difficulty, db)
    except ValueError as e:
        # Topic not found
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except QuizTimeoutError as e:
        # LLM timeout
        logger.error(f"Quiz generation timed out for topic_id={topic_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"error": "AI service took too long", "message": "Please try again"}
        )
    except Exception as e:
        # AI generation or cache failure
        logger.error(f"Quiz generation failed for topic_id={topic_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Quiz generation service unavailable", "message": "Please try again later"}
        )
