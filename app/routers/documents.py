import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import Topic, User
from app.schemas.documents import StudyDocumentOut, TopicEstimateOut
from app.services.document_service import estimate_topic_from_upload, list_documents, upload_document

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/estimate", response_model=TopicEstimateOut)
def estimate_topic_plan(
    topic_name: str = Form(...),
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
):
    del current_user
    try:
        return estimate_topic_from_upload(topic_name, file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Topic estimate failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI estimate failed") from exc


@router.get("/{topic_id}/documents", response_model=list[StudyDocumentOut])
def get_topic_documents(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    return list_documents(db, topic_id, current_user.id)


@router.post("/{topic_id}/documents", response_model=StudyDocumentOut, status_code=status.HTTP_201_CREATED)
def upload_topic_document(
    topic_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    try:
        return upload_document(db, topic, current_user, file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Topic document upload failed for topic %s", topic_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document processing failed. Check the document status and try again.",
        ) from exc