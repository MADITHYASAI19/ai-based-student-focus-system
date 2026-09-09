import io
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy.orm import Session

from ai_service.embeddings.embed import embed_chunks
from ai_service.embeddings.store import upsert_document
from ai_service.generation.document_analyzer import analyze_document, estimate_topic
from ai_service.preprocessing.chunker import chunk_text
from ai_service.preprocessing.cleaner import clean_text
from app.models.models import StudyDocument, Topic, User

logger = logging.getLogger(__name__)
_UPLOAD_DIR = Path("uploads") / "study_documents"
_ALLOWED_EXTENSIONS = {".pdf", ".txt", ".text"}
_MAX_FILE_SIZE = 10 * 1024 * 1024


def list_documents(db: Session, topic_id: int, user_id: int) -> list[StudyDocument]:
    return (
        db.query(StudyDocument)
        .filter(StudyDocument.topic_id == topic_id, StudyDocument.uploaded_by == user_id)
        .order_by(StudyDocument.uploaded_at.desc())
        .all()
    )


def _extract_text(filename: str, content_type: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise ValueError("Only PDF and text documents are supported")
    if len(data) > _MAX_FILE_SIZE:
        raise ValueError("The document must be 10 MB or smaller")
    if suffix == ".pdf" or content_type == "application/pdf":
        reader = PdfReader(io.BytesIO(data))
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        text = data.decode("utf-8", errors="replace")
    return clean_text(text)


def _mark_failed(db: Session, document: StudyDocument, exc: Exception) -> None:
    document.status = "failed"
    document.error_message = str(exc)[:1000]
    document.processed_at = datetime.utcnow()
    db.commit()


def process_document(db: Session, document: StudyDocument, topic: Topic, content: str) -> StudyDocument:
    try:
        chunks = chunk_text(content, chunk_size=300, overlap=30)
        if not chunks:
            raise ValueError("The uploaded document contains no readable text")
        embeddings = embed_chunks(chunks)
        upsert_document(
            collection_name=f"topic_{topic.id}",
            doc_id=f"document_{document.id}",
            chunks=chunks,
            embeddings=embeddings,
            metadata={
                "source_file": document.filename,
                "topic_id": topic.id,
                "document_id": document.id,
            },
        )
        analysis = analyze_document(content, topic.name)
        document.concepts = analysis["concepts"]
        document.difficulty = analysis["difficulty"]
        document.difficulty_reason = analysis["difficulty_reason"]
        document.estimated_hours = analysis["estimated_hours"]
        document.status = "completed"
        document.processed_at = datetime.utcnow()
        document.error_message = None
        db.commit()
        db.refresh(document)
        return document
    except Exception as exc:
        logger.exception("Failed to process document %s", document.id)
        _mark_failed(db, document, exc)
        raise


def upload_document(db: Session, topic: Topic, user: User, upload: UploadFile) -> StudyDocument:
    filename = Path(upload.filename or "document").name
    data = upload.file.read()
    content = _extract_text(filename, upload.content_type or "", data)

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = _UPLOAD_DIR / f"{uuid4().hex}{Path(filename).suffix.lower()}"
    stored_path.write_bytes(data)

    document = StudyDocument(
        topic_id=topic.id,
        uploaded_by=user.id,
        filename=filename,
        stored_path=str(stored_path),
        content_type=upload.content_type or "application/octet-stream",
        status="processing",
        concepts=[],
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return process_document(db, document, topic, content)


def estimate_topic_from_upload(topic_name: str, upload: UploadFile | None) -> dict:
    content = ""
    if upload is not None:
        filename = Path(upload.filename or "document").name
        content = _extract_text(filename, upload.content_type or "", upload.file.read())
    return estimate_topic(topic_name, content)
