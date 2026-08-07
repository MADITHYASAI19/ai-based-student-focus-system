from typing import Literal
from pydantic import BaseModel


class DoubtRequest(BaseModel):
    """Schema for doubt resolution request."""
    student_id: int
    question: str
    subject_id: int


class DoubtAnswer(BaseModel):
    """Schema for doubt resolution answer."""
    answer_text: str
    source_chunk_ids: list[str]
    confidence: Literal["high", "low"]
