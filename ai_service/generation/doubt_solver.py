"""
Doubt resolution module for AI Study Companion.

This module uses the RAG pattern to answer student doubts by:
1. Retrieving relevant context chunks from ChromaDB
2. Building a context-grounded prompt
3. Calling the LLM to generate an answer based only on the provided context

Single source of truth: DoubtAnswer schema is imported from app.schemas.doubt
to ensure both the backend and AI service use the same contract.
"""

import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI

from ai_service.prompts.doubt_prompt import build_doubt_prompt
from app.schemas.doubt import DoubtAnswer

logger = logging.getLogger(__name__)
load_dotenv()

# ---------------------------------------------------------------------------
# LLM client — Groq's OpenAI-compatible endpoint, key from environment
# ---------------------------------------------------------------------------

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_CHAT_MODEL = "llama-3.3-70b-versatile"
_SIMILARITY_THRESHOLD = 0.3


def _get_client() -> OpenAI:
    """Instantiate the OpenAI-compatible Groq client."""
    api_key = os.getenv("AI_API_KEY")
    if not api_key:
        raise ValueError("AI_API_KEY environment variable is not set")
    return OpenAI(api_key=api_key, base_url=_GROQ_BASE_URL, timeout=20.0)


def _call_llm(client: OpenAI, messages: list[dict[str, str]]) -> str:
    """Send messages to the LLM and return the raw response text."""
    response = client.chat.completions.create(
        model=_CHAT_MODEL,
        messages=messages,  # type: ignore[arg-type]
        temperature=0.3,
        timeout=20.0,
    )
    return response.choices[0].message.content or ""


def answer_doubt(question: str, context_chunks: list[dict]) -> DoubtAnswer:
    """Answer a student's doubt using context-grounded LLM generation.
    
    Args:
        question: The student's question
        context_chunks: List of relevant context chunks from RAG retrieval,
                        each with keys: id, text, metadata, similarity_score
        
    Returns:
        DoubtAnswer: The answer with source chunk IDs and confidence
        
    Raises:
        ValueError: If LLM call fails or returns empty response
    """
    if not question.strip():
        raise ValueError("Question cannot be empty")
    
    if not context_chunks:
        logger.warning("No context chunks provided for doubt resolution")
        return DoubtAnswer(
            answer_text="I cannot answer this question because no relevant context was found in the study materials.",
            source_chunk_ids=[],
            confidence="low"
        )
    
    # Step 1: Check similarity threshold before spending API call
    top_chunk = context_chunks[0]
    similarity_score = top_chunk.get("similarity_score", 0.0)
    
    if similarity_score < _SIMILARITY_THRESHOLD:
        logger.info(f"Top chunk similarity {similarity_score:.3f} below threshold {_SIMILARITY_THRESHOLD}, skipping LLM call")
        return DoubtAnswer(
            answer_text="I'm not confident this is covered in your notes.",
            source_chunk_ids=[],
            confidence="low"
        )
    
    # Step 2: Build prompt and call LLM
    try:
        client = _get_client()
        chunk_texts = [c["text"] for c in context_chunks]
        messages = build_doubt_prompt(question, chunk_texts)
        
        logger.info(f"Answering doubt with {len(context_chunks)} context chunks (top similarity: {similarity_score:.3f})")
        answer = _call_llm(client, messages)
        
        if not answer.strip():
            raise ValueError("LLM returned empty response")
        
        # Step 3: Return DoubtAnswer with high confidence and source chunk IDs
        source_chunk_ids = [c["id"] for c in context_chunks]
        
        logger.info(f"Doubt answered with confidence=high, chunks={source_chunk_ids}")
        
        return DoubtAnswer(
            answer_text=answer,
            source_chunk_ids=source_chunk_ids,
            confidence="high"
        )
        
    except Exception as e:
        logger.error(f"Failed to answer doubt: {e}")
        raise ValueError(f"Doubt resolution failed: {e}") from e
