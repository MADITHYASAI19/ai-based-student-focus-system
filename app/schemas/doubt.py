from typing import Literal, Optional
from pydantic import BaseModel


class DoubtRequest(BaseModel):
    """Schema for doubt resolution request."""
    question: str
    subject_id: int
    topic_id: int | None = None
    source_mode: Optional[Literal["pdf+ai", "pdf_only", "general_ai"]] = "pdf+ai"


class AnswerSection(BaseModel):
    """A section of an answer with its source type."""
    type: Literal["pdf", "ai", "mixed"]
    content: str
    sources: Optional[list[dict]] = None  # For PDF: document, page, chunk_id


class DoubtAnswer(BaseModel):
    """Schema for doubt resolution answer with source transparency."""
    answer_text: str
    source_chunk_ids: list[str]
    confidence: Literal["high", "low"]
    sections: Optional[list[AnswerSection]] = None  # Source-aware breakdown
    source_type: Optional[Literal["pdf", "ai", "mixed", "none"]] = None
