import json
import logging
from typing import Dict, Any

from ai_service.generation.provider import complete_json

logger = logging.getLogger(__name__)

def generate_topic_breakdown(raw_text: str) -> list[Dict[str, Any]]:
    system_prompt = (
        "You are an expert study planner. The user will provide a text describing the topics they want to study. "
        "Your task is to break down the provided text into clean, individual concepts or topics, and estimate the "
        "duration in minutes required to study each topic. Output valid JSON in the format: "
        '{"topics": [{"topic_name": "string", "duration_minutes": number}]}'
    )
    
    try:
        content = complete_json([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_text}
        ])
        data = json.loads(content)
        return data.get("topics", [])
    except Exception as e:
        logger.error(f"Failed to generate topic breakdown: {e}")
        raise ValueError("Failed to generate topic breakdown from the provided text.")

