import re
import json
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field, ValidationError

from ai_service.generation.plan_gen import generate_topic_breakdown as _gen_breakdown
from app.core.config import get_settings

class TopicSchema(BaseModel):
    name: str = Field(..., description="The name of the study topic")
    subtopics: List[str] = Field(default_factory=list, description="List of subtopics for this topic")

class StudyPlanSchema(BaseModel):
    subject: str = Field(..., description="The overall subject name")
    topics: List[TopicSchema] = Field(..., description="List of structured topics")

class TopicPipeline:
    """
    Processing pipeline for transforming raw student requests into clean,
    structured, and validated study topics.
    """

    @staticmethod
    def clean_input(text: str) -> str:
        """Normalizes student input by removing noise."""
        if not text:
            return ""
        # Remove extra whitespace and repeated punctuation
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.sub(r'([!?.]){2,}', r'\1', text)
        return text

    @staticmethod
    def clean_topic_text(text: str) -> str:
        """Removes AI chatter, markdown, and numbering from topic/subtopic names."""
        # Remove markdown bold/italic
        text = re.sub(r'[\*\_\`]', '', text)
        # Remove numbering (e.g., "1. ", "a) ", "Step 1: ")
        text = re.sub(r'^(\d+[\.\)]\s*|[a-zA-Z][\.\)]\s*|Step\s*\d+:\s*)', '', text, flags=re.IGNORECASE)
        # Remove AI prefixes
        text = re.sub(r'^(Topic|Subtopic):\s*', '', text, flags=re.IGNORECASE)
        # Remove trailing punctuation and whitespace
        text = text.strip().strip('.:')
        return text

    @classmethod
    def process_request(cls, raw_request: str) -> Tuple[Optional[StudyPlanSchema], Optional[str]]:
        """
        The full pipeline: Clean -> Generate -> Validate -> Clean Result -> Normalize.
        """
        # 1. Input Cleaning
        cleaned_request = cls.clean_input(raw_request)
        if not cleaned_request:
            return None, "Request was empty or invalid."

        # 2. Redundancy Check (Simple Hash-based cache)
        # In a real app, we would check a DB cache here.

        # 3. Generation
        try:
            # Note: we pass the cleaned request to the existing generation logic
            raw_response = _gen_breakdown(cleaned_request)

            # 4. JSON Repair & Validation
            # Remove markdown code blocks if present
            if "```json" in raw_response:
                raw_response = raw_response.split("```json")[1].split("```")[0]
            elif "```" in raw_response:
                raw_response = raw_//Cs_response.split("```")[1].split("```")[0]

            # Parse and validate via Pydantic
            data = json.loads(raw_response)
            validated_plan = StudyPlanSchema(**data)

            # 5. Cleaning & Normalization of the resulting topics
            cleaned_topics = []
            seen_topics = set()

            for topic in validated_plan.topics:
                name = cls.clean_topic_text(topic.name)
                if not name or name.lower() in seen_topics:
                    continue

                seen_topics.add(name.lower())

                cleaned_subtopics = []
                seen_subtopics = set()
                for sub in topic.subtopics:
                    c_sub = cls.clean_topic_text(sub)
                    if c_sub and c_sub.lower() not in seen_subtopics:
                        cleaned_subtopics.append(c_sub)
                        seen_subtopics.add(c_sub.lower())

                cleaned_topics.append(TopicSchema(name=name, subtopics=cleaned_subtopics))

            validated_plan.topics = cleaned_topics
            return validated_plan, None

        except (json.JSONDecodeError, ValidationError) as e:
            return None, f"AI returned malformed data: {str(e)}"
        except Exception as e:
            return None, f"An unexpected error occurred: {str(e)}"
