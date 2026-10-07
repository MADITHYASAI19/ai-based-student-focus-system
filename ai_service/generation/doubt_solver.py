"""
Doubt resolution module for AI Study Companion.

This module uses the RAG pattern to answer student doubts by:
1. Retrieving relevant context chunks from ChromaDB
2. Building a context-grounded prompt
3. Calling the LLM to generate an answer based on the provided context
4. Parsing the response into source-aware sections (PDF vs AI knowledge)

Single source of truth: DoubtAnswer schema is imported from app.schemas.doubt
to ensure both the backend and AI service use the same contract.
"""

import logging
import re
from typing import Any

from ai_service.generation.provider import complete_text
from ai_service.prompts.doubt_prompt import build_doubt_prompt, build_alternate_style_prompt
from app.schemas.doubt import DoubtAnswer, AnswerSection

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SIMILARITY_THRESHOLD = 0.3


def _call_llm(messages: list[dict[str, str]]) -> str:
    """Send messages to the LLM and return the raw response text.
    
    Uses the centralized AI provider with key rotation.
    """
    return complete_text(messages)


def _parse_source_sections(answer: str, context_chunks: list[dict]) -> list[AnswerSection]:
    """Parse the AI response into source-aware sections (PDF vs AI knowledge).
    
    Returns a list of AnswerSection objects with type, content, and sources.
    """
    sections: list[AnswerSection] = []
    
    # Pattern to match source sections
    pdf_pattern = r'📄 FROM YOUR PDF\s*\n+(.*?)(?=\n🤖|\n\n|$)'
    ai_pattern = r'🤖 ADDITIONAL AI KNOWLEDGE\s*\n+(.*?)(?=\n📄|\n\n|$)'
    mixed_pattern = r'📄 FROM YOUR PDF\s*\n+(.*?)\s*\+\s*🤖 ADDITIONAL AI KNOWLEDGE\s*\n+(.*?)(?=\n\n|$)'
    
    # Try mixed pattern first
    mixed_match = re.search(mixed_pattern, answer, re.DOTALL)
    if mixed_match:
        pdf_content = mixed_match.group(1).strip()
        ai_content = mixed_match.group(2).strip()
        
        sections.append(AnswerSection(
            type="mixed",
            content=answer.strip(),
            sources=[{"type": "pdf", "chunks": [c["id"] for c in context_chunks]}] if context_chunks else None
        ))
        return sections
    
    # Try PDF section
    pdf_match = re.search(pdf_pattern, answer, re.DOTALL)
    ai_match = re.search(ai_pattern, answer, re.DOTALL)
    
    if pdf_match:
        pdf_content = pdf_match.group(1).strip()
        sections.append(AnswerSection(
            type="pdf",
            content=pdf_content,
            sources=[{"type": "pdf", "chunks": [c["id"] for c in context_chunks]}] if context_chunks else None
        ))
    
    if ai_match:
        ai_content = ai_match.group(1).strip()
        sections.append(AnswerSection(
            type="ai",
            content=ai_content,
            sources=None
        ))
    
    # If no sections found (old format), treat entire answer as mixed if chunks exist, else AI
    if not sections:
        if context_chunks:
            sections.append(AnswerSection(
                type="mixed",
                content=answer.strip(),
                sources=[{"type": "pdf", "chunks": [c["id"] for c in context_chunks]}]
            ))
        else:
            sections.append(AnswerSection(
                type="ai",
                content=answer.strip(),
                sources=None
            ))
    
    return sections


def _determine_source_type(sections: list[AnswerSection]) -> str:
    """Determine the overall source type from sections."""
    if not sections:
        return "none"
    
    types = {s.type for s in sections}
    if "mixed" in types:
        return "mixed"
    if "pdf" in types and "ai" in types:
        return "mixed"
    if "pdf" in types:
        return "pdf"
    if "ai" in types:
        return "ai"
    return "none"


def answer_doubt(question: str, context_chunks: list[dict], source_mode: str = "pdf+ai", conversation_history: list[dict] | None = None) -> DoubtAnswer:
    """Answer a student's doubt using context-grounded LLM generation.

    Args:
        question: The student's question
        context_chunks: List of relevant context chunks from RAG retrieval,
                        each with keys: id, text, metadata, similarity_score
        source_mode: "pdf+ai" (default), "pdf_only", or "general_ai"
        conversation_history: Optional list of previous messages for context

    Returns:
        DoubtAnswer: The answer with source chunk IDs, confidence, and source-aware sections

    Raises:
        ValueError: If LLM call fails or returns empty response
    """
    if not question.strip():
        raise ValueError("Question cannot be empty")

    # Handle source_mode: general_ai skips RAG entirely
    if source_mode == "general_ai":
        try:
            messages = [
                {"role": "system", "content": "You are a helpful AI study companion. Answer the student's question clearly and concisely."},
            ]

            # Add conversation history if provided (last 5 messages)
            if conversation_history:
                recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
                messages.extend(recent_history)

            messages.append({"role": "user", "content": question.strip()})

            answer = _call_llm(messages)

            if not answer.strip():
                raise ValueError("LLM returned empty response")

            return DoubtAnswer(
                answer_text=answer,
                source_chunk_ids=[],
                confidence="high",
                sections=[AnswerSection(type="ai", content=answer, sources=None)],
                source_type="ai"
            )
        except Exception as e:
            logger.error(f"Failed to answer doubt with general AI: {e}")
            raise ValueError(f"Doubt resolution failed: {e}") from e

    # pdf_only or pdf+ai: use RAG
    if not context_chunks:
        logger.warning("No context chunks provided for doubt resolution")
        return DoubtAnswer(
            answer_text="I cannot answer this question because no relevant context was found in the study materials.",
            source_chunk_ids=[],
            confidence="low",
            sections=[AnswerSection(type="pdf", content="No relevant PDF content found.", sources=None)],
            source_type="none"
        )

    # Step 1: Check similarity threshold before spending API call
    top_chunk = context_chunks[0]
    similarity_score = top_chunk.get("similarity_score", 0.0)

    if similarity_score < _SIMILARITY_THRESHOLD:
        logger.info(f"Top chunk similarity {similarity_score:.3f} below threshold {_SIMILARITY_THRESHOLD}")

        # Preserve existing behavior for pdf_only
        if source_mode == "pdf_only":
            return DoubtAnswer(
                answer_text="I'm not confident this is covered in your notes.",
                source_chunk_ids=[],
                confidence="low",
                sections=[AnswerSection(type="pdf", content="No relevant PDF content found with sufficient confidence.", sources=None)],
                source_type="none"
            )

        # Hybrid fallback for pdf+ai: route to general AI generation
        logger.info("Falling back to general AI knowledge as PDF context is irrelevant")
        try:
            messages = [
                {"role": "system", "content": "You are a helpful AI study companion. The provided study materials are not relevant to this specific question, so answer using your general knowledge."},
            ]
            if conversation_history:
                recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
                messages.extend(recent_history)
            messages.append({"role": "user", "content": question.strip()})

            answer = _call_llm(messages)
            if not answer.strip():
                raise ValueError("LLM returned empty response")

            return DoubtAnswer(
                answer_text=answer,
                source_chunk_ids=[],
                confidence="high",
                sections=[AnswerSection(type="ai", content=answer, sources=None)],
                source_type="ai"
            )
        except Exception as e:
            logger.error(f"Fallback to general AI failed: {e}")
            # Last resort failure
            return DoubtAnswer(
                answer_text="I'm not confident this is covered in your notes, and I encountered an error while trying to provide a general answer.",
                source_chunk_ids=[],
                confidence="low",
                sections=[AnswerSection(type="pdf", content="No relevant PDF content found.", sources=None)],
                source_type="none"
            )

    # Step 2: Build prompt and call LLM
    try:
        chunk_texts = [c["text"] for c in context_chunks]
        messages = build_doubt_prompt(question, chunk_texts, conversation_history)

        logger.info(f"Answering doubt with {len(context_chunks)} context chunks (top similarity: {similarity_score:.3f}, source_mode: {source_mode})")
        answer = _call_llm(messages)

        if not answer.strip():
            raise ValueError("LLM returned empty response")

        # Step 3: Parse source sections
        sections = _parse_source_sections(answer, context_chunks)
        source_type = _determine_source_type(sections)

        # Step 4: Return DoubtAnswer with high confidence and source chunk IDs
        source_chunk_ids = [c["id"] for c in context_chunks]

        logger.info(f"Doubt answered with confidence=high, chunks={source_chunk_ids}, source_type={source_type}")

        return DoubtAnswer(
            answer_text=answer,
            source_chunk_ids=source_chunk_ids,
            confidence="high",
            sections=sections,
            source_type=source_type
        )

    except Exception as e:
        logger.error(f"Failed to answer doubt: {e}")
        raise ValueError(f"Doubt resolution failed: {e}") from e


def answer_doubt_alternate_style(
    question: str,
    context_chunks: list[dict],
    prior_attempts: list[str],
    source_mode: str = "pdf+ai",
    conversation_history: list[dict] | None = None
) -> DoubtAnswer:
    """Answer a student's doubt using a different explanation style than prior attempts.
    
    This function uses the same grounding rules as answer_doubt(), but the prompt
    explicitly instructs the model to explain using a DIFFERENT approach than what's
    implied by prior_attempts. For example:
    - If prior attempts used text-heavy explanations, try a concrete worked example
    - If prior attempts used abstract concepts, try an analogy or visual description
    - If prior attempts were too technical, try a simpler breakdown
    
    Args:
        question: The student's question
        context_chunks: List of relevant context chunks from RAG retrieval,
                        each with keys: id, text, metadata, similarity_score
        prior_attempts: List of previous answer attempts that the student didn't understand
        source_mode: "pdf+ai" (default), "pdf_only", or "general_ai"
        
    Returns:
        DoubtAnswer: The answer with source chunk IDs, confidence, and source-aware sections
        
    Raises:
        ValueError: If LLM call fails or returns empty response
    """
    if not question.strip():
        raise ValueError("Question cannot be empty")
    
    if not prior_attempts:
        logger.warning("No prior attempts provided for alternate style generation")
        # Fall back to standard answer_doubt if no prior attempts
        return answer_doubt(question, context_chunks, source_mode)
    
    # Handle source_mode: general_ai skips RAG entirely
    if source_mode == "general_ai":
        try:
            messages = [
                {"role": "system", "content": "You are a helpful AI study companion. Explain using a different approach than previous attempts."},
            ]
            
            # Add conversation history if provided (last 5 messages)
            if conversation_history:
                recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
                messages.extend(recent_history)
            
            messages.append({"role": "user", "content": f"Question: {question.strip()}\n\nPrevious attempts:\n" + "\n\n".join(prior_attempts)})
            
            answer = _call_llm(messages)
            
            if not answer.strip():
                raise ValueError("LLM returned empty response")
            
            return DoubtAnswer(
                answer_text=answer,
                source_chunk_ids=[],
                confidence="high",
                sections=[AnswerSection(type="ai", content=answer, sources=None)],
                source_type="ai"
            )
        except Exception as e:
            logger.error(f"Failed to answer doubt with alternate style (general AI): {e}")
            raise ValueError(f"Doubt resolution with alternate style failed: {e}") from e
    
    if not context_chunks:
        logger.warning("No context chunks provided for doubt resolution")
        return DoubtAnswer(
            answer_text="I cannot answer this question because no relevant context was found in the study materials.",
            source_chunk_ids=[],
            confidence="low",
            sections=[AnswerSection(type="pdf", content="No relevant PDF content found.", sources=None)],
            source_type="none"
        )
    
    # Step 1: Check similarity threshold before spending API call
    top_chunk = context_chunks[0]
    similarity_score = top_chunk.get("similarity_score", 0.0)
    
    if similarity_score < _SIMILARITY_THRESHOLD:
        logger.info(f"Top chunk similarity {similarity_score:.3f} below threshold {_SIMILARITY_THRESHOLD}, skipping LLM call")
        return DoubtAnswer(
            answer_text="I'm not confident this is covered in your notes.",
            source_chunk_ids=[],
            confidence="low",
            sections=[AnswerSection(type="pdf", content="No relevant PDF content found with sufficient confidence.", sources=None)],
            source_type="none"
        )
    
    # Step 2: Build prompt with prior attempts and call LLM
    try:
        chunk_texts = [c["text"] for c in context_chunks]
        messages = build_alternate_style_prompt(question, chunk_texts, prior_attempts)
        
        logger.info(f"Answering doubt with alternate style, {len(context_chunks)} context chunks (top similarity: {similarity_score:.3f}, source_mode: {source_mode})")
        answer = _call_llm(messages)
        
        if not answer.strip():
            raise ValueError("LLM returned empty response")
        
        # Step 3: Parse source sections
        sections = _parse_source_sections(answer, context_chunks)
        source_type = _determine_source_type(sections)
        
        # Step 4: Return DoubtAnswer with high confidence and source chunk IDs
        source_chunk_ids = [c["id"] for c in context_chunks]
        
        logger.info(f"Doubt answered with alternate style, confidence=high, chunks={source_chunk_ids}, source_type={source_type}")
        
        return DoubtAnswer(
            answer_text=answer,
            source_chunk_ids=source_chunk_ids,
            confidence="high",
            sections=sections,
            source_type=source_type
        )
        
    except Exception as e:
        logger.error(f"Failed to answer doubt with alternate style: {e}")
        raise ValueError(f"Doubt resolution with alternate style failed: {e}") from e
