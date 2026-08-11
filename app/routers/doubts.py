import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import get_current_user
from app.models.models import User
from app.schemas.doubt import DoubtAnswer, DoubtRequest
from app.services.doubt_service import answer_doubt, DoubtTimeoutError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=DoubtAnswer, status_code=status.HTTP_200_OK)
def resolve_doubt(
    request: DoubtRequest,
    current_user: User = Depends(get_current_user),
):
    """Resolve a student's doubt using RAG retrieval and LLM generation."""
    try:
        return answer_doubt(request.question, request.subject_id)
    except ValueError as e:
        # Validation or context retrieval failure
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except DoubtTimeoutError as e:
        # LLM timeout
        logger.error(f"Doubt resolution timed out: {e}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"error": "AI service took too long", "message": "Please try again"}
        )
    except Exception as e:
        # AI generation or RAG failure
        logger.error(f"Doubt resolution failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Doubt resolution service unavailable", "message": "Please try again later"}
        )