import pytest
from unittest.mock import patch
from ai_service.generation.pipeline import TopicPipeline, StudyPlanSchema, TopicSchema


def test_clean_input_empty():
    assert TopicPipeline.clean_input("") == ""
    assert TopicPipeline.clean_input(None) == ""


def test_clean_input_normalizes_spaces_and_punctuation():
    raw = "  Calculus   and   Physics???!!  "
    cleaned = TopicPipeline.clean_input(raw)
    assert cleaned == "Calculus and Physics?!"


def test_clean_topic_text():
    assert TopicPipeline.clean_topic_text("**Topic 1: Limits & Continuity**") == "Limits & Continuity"
    assert TopicPipeline.clean_topic_text("1. Derivatives") == "Derivatives"
    assert TopicPipeline.clean_topic_text("Step 2: Integration.") == "Integration"
    assert TopicPipeline.clean_topic_text("a) Fundamentals:") == "Fundamentals"
    assert TopicPipeline.clean_topic_text("Subtopic: Optimization") == "Optimization"


def test_process_request_empty():
    plan, error = TopicPipeline.process_request("")
    assert plan is None
    assert "valid study topic" in error.lower()


def test_extract_study_intent():
    assert TopicPipeline.extract_study_intent("I want to learn Machine Learning from basics") == "Machine Learning from basics"
    assert TopicPipeline.extract_study_intent("Please teach me Quantum Physics") == "Quantum Physics"
    assert TopicPipeline.extract_study_intent("Help me study Organic Chemistry") == "Organic Chemistry"


@patch("ai_service.generation.pipeline._gen_breakdown")
def test_process_request_success(mock_gen):
    mock_gen.return_value = """
    ```json
    {
        "subject": "Mathematics",
        "topics": [
            {
                "name": "1. Differential Equations",
                "subtopics": [
                    "a) First Order",
                    "b) Second Order",
                    "First Order"
                ]
            },
            {
                "name": "Differential Equations",
                "subtopics": ["Another topic"]
            }
        ]
    }
    ```
    """
    plan, error = TopicPipeline.process_request("teach me diff eq")
    assert error is None
    assert plan is not None
    assert plan.subject == "Mathematics"
    # Duplicate topic should be deduplicated
    assert len(plan.topics) == 1
    assert plan.topics[0].name == "Differential Equations"
    # Duplicate subtopic ("First Order") should be deduplicated
    assert plan.topics[0].subtopics == ["First Order", "Second Order"]


@patch("ai_service.generation.pipeline._gen_breakdown")
def test_process_request_cached(mock_gen):
    # Second call should use cache and not call _gen_breakdown again
    mock_gen.side_effect = Exception("Should not be called because of cache")
    plan, error = TopicPipeline.process_request("teach me diff eq")
    assert error is None
    assert plan is not None
    assert plan.topics[0].name == "Differential Equations"


@patch("ai_service.generation.pipeline._gen_breakdown")
def test_process_request_malformed_json(mock_gen):
    mock_gen.return_value = "Not a json string"
    plan, error = TopicPipeline.process_request("brand new uncached query")
    assert plan is None
    assert "properly" in error.lower() or "structured" in error.lower()
