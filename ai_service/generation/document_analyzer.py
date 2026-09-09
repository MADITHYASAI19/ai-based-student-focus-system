"""LLM analysis for uploaded topic study documents."""

import json
import logging
from ai_service.generation.provider import complete_json, complete_text

logger = logging.getLogger(__name__)
def analyze_document(content: str, topic_name: str) -> dict:
    """Return structured concepts, difficulty, reason, and study hours."""
    if not content.strip():
        raise ValueError("The uploaded document contains no readable text")

    return _analyze(topic_name, content)


def estimate_topic(topic_name: str, content: str = "") -> dict:
    """Estimate topic difficulty and study time before a plan is confirmed."""
    if not topic_name.strip():
        raise ValueError("Topic name cannot be empty")
    return _analyze(topic_name, content or "No study document has been uploaded yet. Estimate from the topic name and typical scope.")


def _analyze(topic_name: str, content: str) -> dict:
    prompt = f"""Analyze the study topic: {topic_name}.
Return ONLY valid JSON with this exact shape:
{{
  "concepts": ["specific concept or subtopic"],
    "topics": [
        {{"name": "main topic", "subtopics": [{{"name": "subtopic", "evidence": "verbatim or faithful passage from the document"}}]}}
    ],
  "difficulty": "easy|medium|hard",
  "difficulty_reason": "one short reason",
  "estimated_hours": 2.5
}}

Identify only concepts, topics, subtopics, and evidence actually supported by the supplied document. Do not invent a topic merely from its name. Estimate hours from the document scope and difficulty.

DOCUMENT:
{content[:120000]}"""
    raw = complete_json([
            {"role": "system", "content": "You are a precise academic curriculum analyst."},
            {"role": "user", "content": prompt},
        ])
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Document analysis returned invalid JSON: %s", raw[:500])
        raise ValueError("The document analysis response was not valid JSON") from exc

    concepts = result.get("concepts")
    topics = result.get("topics", [])
    difficulty = result.get("difficulty")
    reason = result.get("difficulty_reason")
    hours = result.get("estimated_hours")
    if not isinstance(concepts, list) or not all(isinstance(item, str) for item in concepts):
        raise ValueError("Document analysis returned invalid concepts")
    if not isinstance(topics, list):
        raise ValueError("Document analysis returned invalid topics")
    if difficulty not in {"easy", "medium", "hard"} or not isinstance(reason, str):
        raise ValueError("Document analysis returned invalid difficulty")
    try:
        estimated_hours = max(0.25, float(hours))
    except (TypeError, ValueError) as exc:
        raise ValueError("Document analysis returned invalid study hours") from exc

    return {
        "concepts": concepts[:30],
        "topics": [
            {
                "name": str(topic.get("name", ""))[:200],
                "subtopics": [
                    {"name": str(subtopic.get("name", ""))[:200], "evidence": str(subtopic.get("evidence", ""))[:1500]}
                    for subtopic in topic.get("subtopics", [])
                    if isinstance(subtopic, dict) and subtopic.get("name")
                ],
            }
            for topic in topics
            if isinstance(topic, dict) and topic.get("name")
        ],
        "difficulty": difficulty,
        "difficulty_reason": reason[:500],
        "estimated_hours": round(estimated_hours, 2),
    }


def generate_explanation(topic_name: str, subtopic: str, mode: str, evidence: str) -> str:
    """Explain only the selected PDF evidence at the requested level."""
    if mode not in {"child", "average", "topper"}:
        raise ValueError("mode must be child, average, or topper")
    instructions = {
        "child": "Use very simple language, analogies, and easy examples. Define technical words.",
        "average": "Use clear student-level language, standard terminology, and practical examples.",
        "topper": "Give a rigorous exam-oriented explanation with technical details, edge cases, and connections.",
    }
    result = complete_text([
        {"role": "system", "content": "You are a source-grounded tutor. Never claim facts absent from the provided PDF evidence."},
        {"role": "user", "content": f"Topic: {topic_name}\nSubtopic: {subtopic}\nMode: {mode}\nInstructions: {instructions[mode]}\n\nPDF evidence:\n{evidence[:12000]}"},
    ])
    if not result.strip():
        raise ValueError("The explanation response was empty")
    return result
