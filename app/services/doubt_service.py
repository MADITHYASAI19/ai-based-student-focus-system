import logging
from typing import List
from openai import APITimeoutError

from app.schemas.doubt import DoubtAnswer, DoubtRequest
from ai_service.embeddings.store import query
from ai_service.generation.doubt_solver import answer_doubt as ai_answer_doubt

logger = logging.getLogger(__name__)


class DoubtTimeoutError(Exception):
    """Raised when doubt resolution times out."""
    pass


def answer_doubt(question: str, subject_id: int | None = None, topic_id: int | None = None, source_mode: str = "pdf+ai", conversation_history: list[dict] | None = None) -> DoubtAnswer:
    """Answer a student's doubt using RAG retrieval and LLM generation.
    
    Args:
        question: The student's question
        subject_id: ID of the subject to search for context (optional for general AI)
        topic_id: Optional topic ID for topic-scoped RAG
        source_mode: "pdf+ai" (default), "pdf_only", or "general_ai"
        conversation_history: Optional list of previous messages for context
        
    Returns:
        DoubtAnswer: The answer with source chunk IDs, confidence, and source-aware sections
        
    Raises:
        ValueError: If question is empty or subject lookup fails
        Exception: If RAG retrieval or LLM generation fails
    """
    if not question or not question.strip():
        raise ValueError("Question cannot be empty")
    
    # If no subject_id provided, force general_ai mode
    if subject_id is None:
        source_mode = "general_ai"
    
    # Handle general_ai mode: skip RAG entirely
    if source_mode == "general_ai":
        try:
            return ai_answer_doubt(question, [], source_mode=source_mode, conversation_history=conversation_history)
        except APITimeoutError as e:
            logger.error(f"Doubt resolution timed out: {e}")
            raise DoubtTimeoutError("AI service took too long, please try again") from e
        except Exception as e:
            logger.error(f"Failed to generate answer for doubt: {e}")
            raise
    
    # RAG mode: query ChromaDB for relevant context chunks
    collection_name = f"topic_{topic_id}" if topic_id is not None else f"subject_{subject_id}"
    try:
        logger.info(f"Querying collection '{collection_name}' for: {question[:100]}")
        results = query(collection_name, question, top_k=5)
        
        logger.info(f"Retrieved {len(results)} context chunks")
        
    except Exception as e:
        logger.error(f"Failed to query ChromaDB for subject_{subject_id}: {e}")
        raise ValueError(f"Failed to retrieve context for subject {subject_id}") from e
    
    # Generate answer using LLM (passing full context chunks with similarity scores)
    try:
        return ai_answer_doubt(question, results, source_mode=source_mode, conversation_history=conversation_history)
        
    except APITimeoutError as e:
        logger.error(f"Doubt resolution timed out: {e}")
        raise DoubtTimeoutError("AI service took too long, please try again") from e
    except Exception as e:
        logger.error(f"Failed to generate answer for doubt: {e}")
        raise
