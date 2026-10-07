import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import Topic, User
from app.schemas.documents import ExplanationOut, ExplanationRequest, StudyDocumentOut, TopicEstimateOut
from app.services.document_service import explain_document_subtopic, estimate_topic_from_upload, list_documents, upload_document, upload_focus_document, upload_doubt_document as upload_doubt_document_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/focus/documents", response_model=StudyDocumentOut, status_code=status.HTTP_201_CREATED)
def upload_focus_learning_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a Focus Session document and let the AI create its topic structure."""
    try:
        return upload_focus_document(db, current_user, file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Focus document upload failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Document processing failed") from exc


@router.post("/documents/{document_id}/explain", response_model=ExplanationOut)
def explain_subtopic(
    document_id: int,
    request: ExplanationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return explain_document_subtopic(db, document_id, current_user.id, request.subtopic, request.mode)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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


@router.post("/doubts/documents", response_model=StudyDocumentOut, status_code=status.HTTP_201_CREATED)
def upload_doubt_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a standalone document for the Doubt Solver (not tied to a topic)."""
    try:
        return upload_doubt_document_service(db, current_user, file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Doubt document upload failed")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Document processing failed") from exc


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