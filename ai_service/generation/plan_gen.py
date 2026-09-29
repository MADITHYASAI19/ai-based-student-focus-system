import json
import logging
from typing import Dict, Any

from ai_service.generation.provider import complete_json

logger = logging.getLogger(__name__)

def generate_topic_breakdown(raw_text: str) -> str:
    """
    Calls the AI to generate a structured study breakdown.
    Now returns the raw JSON string to be processed by the TopicPipeline.
    """
    system_prompt = (
        "You are an expert study planner. The user will provide a text describing the topics they want to study. "
        "Your task is to break down the provided text into a structured study plan. "
        "Include a subject name, and a list of topics. Each topic must have a name and a list of subtopics. "
        "Output strictly valid JSON in the format: "
        '{"subject": "string", "topics": [{"name": "string", "subtopics": ["string"]}]}'
    )

    try:
        content = complete_json([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_text}
        ])
        return content
    except Exception as e:
        logger.error(f"Failed to generate topic breakdown: {e}")
        raise ValueError("Failed to generate topic breakdown from the provided text.")

