import re
import json
import time
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field, ValidationError

from ai_service.generation.plan_gen import generate_topic_breakdown as _gen_breakdown

class TopicSchema(BaseModel):
    name: str = Field(..., description="The name of the study topic")
    subtopics: List[str] = Field(default_factory=list, description="List of subtopics for this topic")

class StudyPlanSchema(BaseModel):
    subject: str = Field(..., description="The overall subject name")
    topics: List[TopicSchema] = Field(..., description="List of structured topics")

# In-memory cache for avoiding redundant AI calls: sha256(intent) -> (timestamp, StudyPlanSchema)
_PIPELINE_CACHE: Dict[str, Tuple[float, StudyPlanSchema]] = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour cache


class TopicPipeline:
    """
    Processing pipeline for transforming raw student requests into clean,
    structured, and validated study topics.
    """

    @staticmethod
    def clean_input(text: str) -> str:
        """Normalizes student input by removing noise, extra spaces, and repeated punctuation."""
        if not text:
            return ""
        # Truncate overly long inputs to prevent token abuse and timeouts
        text = text[:600].strip()
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        # Collapse repeated punctuation (e.g. "??!!" -> "?!")
        text = re.sub(r'([!?.])\1+', r'\1', text)
        # Collapse repeated consecutive words (e.g. "math math" -> "math")
        text = re.sub(r'\b(\w+)(?:\s+\1\b)+', r'\1', text, flags=re.IGNORECASE)
        return text.strip()

    @staticmethod
    def extract_study_intent(text: str) -> str:
        """Extracts core learning intent by stripping conversational noise."""
        if not text:
            return ""
        patterns = [
            r'^(?:hello|hi|hey|please|can you|could you|kindly)\s+',
            r'^(?:i want to learn|i want to study|i need to learn|i need to study|help me study|help me learn)\s+',
            r'^(?:teach me|explain to me|give me a study plan for|create a plan for|break down|give me topics for)\s+',
            r'^(?:topics on|topics for|syllabus for|curriculum for)\s+',
        ]
        cleaned = text
        for pat in patterns:
            cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE).strip()
        return cleaned if cleaned else text

    @staticmethod
    def clean_topic_text(text: str) -> str:
        """Removes AI chatter, markdown, and numbering from topic/subtopic names."""
        if not text:
            return ""
        # Remove markdown bold/italic/backticks/quotes
        text = re.sub(r'[\*\_\`\"\'“”]', '', text)
        # Remove conversational chatter prefixes
        text = re.sub(r'^(here are (some|the|your) (topics|subtopics|concepts):?)\s*', '', text, flags=re.IGNORECASE)
        # Remove AI prefixes with optional numbering (e.g. "Topic 1: ", "Subtopic A: ")
        text = re.sub(r'^(Topic|Subtopic|Unit|Chapter|Module)(\s*[\d\w]+)?:\s*', '', text, flags=re.IGNORECASE)
        # Remove numbering (e.g., "1. ", "a) ", "Step 1: ", "- ")
        text = re.sub(r'^(\d+[\.\)]\s*|[a-zA-Z][\.\)]\s*|Step\s*\d+:\s*|[-•*]\s*)', '', text, flags=re.IGNORECASE)
        # Remove trailing punctuation and whitespace
        text = text.strip().strip('.:;,')
        if text and text[0].islower():
            text = text[0].upper() + text[1:]
        return text.strip()

    @classmethod
    def process_request(cls, raw_request: str) -> Tuple[Optional[StudyPlanSchema], Optional[str]]:
        """
        The full pipeline: Clean -> Extract Intent -> Cache Check -> Generate -> Validate -> Clean -> Normalize.
        """
        # 1. Input Cleaning
        cleaned_input = cls.clean_input(raw_request)
        if not cleaned_input or len(cleaned_input) < 2:
            return None, "Please provide a valid study topic or request."

        # 2. Extract Intent
        intent_request = cls.extract_study_intent(cleaned_input)
        if not intent_request:
            intent_request = cleaned_input

        # 3. Check Cache to avoid redundant AI calls
        cache_key = hashlib.sha256(intent_request.lower().strip().encode('utf-8')).hexdigest()
        now = time.time()
        if cache_key in _PIPELINE_CACHE:
            ts, cached_plan = _PIPELINE_CACHE[cache_key]
            if now - ts < _CACHE_TTL_SECONDS:
                return cached_plan, None

        # 4. Generation
        try:
            raw_response = _gen_breakdown(intent_request)

            # JSON extraction
            if "```json" in raw_response:
                raw_response = raw_response.split("```json")[1].split("```")[0]
            elif "```" in raw_response:
                raw_response = raw_response.split("```")[1].split("```")[0]

            data = json.loads(raw_response.strip())
            validated_plan = StudyPlanSchema(**data)

            # 5. Cleaning & Normalization of topics and subtopics
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

            if not cleaned_topics:
                return None, "Could not identify clear topics from your request. Please try with more specific terms."

            validated_plan.subject = cls.clean_topic_text(validated_plan.subject) or "General Study"
            validated_plan.topics = cleaned_topics

            # Save in cache
            _PIPELINE_CACHE[cache_key] = (now, validated_plan)
            return validated_plan, None

        except (json.JSONDecodeError, ValidationError):
            return None, "The study breakdown could not be structured properly. Please try again."
        except Exception as e:
            return None, "We couldn't generate your study plan right now. Please try again in a moment."
