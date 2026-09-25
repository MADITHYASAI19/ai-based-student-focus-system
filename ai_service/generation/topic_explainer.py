"""Generate a detailed topic explanation for a student to study from."""
import logging
from ai_service.generation.provider import complete_text

logger = logging.getLogger(__name__)


def generate_topic_explanation(topic_name: str, mode: str = "average") -> str:
    """Generate a structured, detailed explanation of a topic.

    Args:
        topic_name: The name of the topic to explain.
        mode: 'child' | 'average' | 'topper'
    """
    mode_instructions = {
        "child": "Explain in very simple language, use analogies and everyday examples. Keep sentences short.",
        "average": "Explain clearly for a typical student. Use structured headings, examples, and cover basics to intermediate level.",
        "topper": "Provide a rigorous, comprehensive explanation including edge cases, complexity analysis, and advanced nuances.",
    }
    level_instruction = mode_instructions.get(mode, mode_instructions["average"])

    system_prompt = f"""You are an expert teacher. {level_instruction}

Provide a complete, structured explanation for the given topic using EXACTLY this format:

## Topic Overview
What the topic is, why it matters, and where it is used.

## Key Concepts
List and explain the core ideas clearly.

## Detailed Explanation
Walk through from basics → intermediate → advanced.

## Example
Provide a concrete, easy-to-understand example.

## Real-world Application
Where is this used in real applications?

## Important Points
• Bullet-point key revision notes.

## Common Mistakes
• What students commonly get wrong.

## Exam/Interview Perspective
Key questions or concepts often tested.

For programming/DSA topics, additionally include:
## Algorithm & Working
Step-by-step algorithm with time/space complexity.

Keep the explanation thorough and educational — NOT just a short paragraph.
"""

    try:
        return complete_text([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Explain: {topic_name}"},
        ])
    except Exception as e:
        logger.error(f"Failed to generate topic explanation for '{topic_name}': {e}")
        raise ValueError(f"Could not generate explanation for '{topic_name}'.")
