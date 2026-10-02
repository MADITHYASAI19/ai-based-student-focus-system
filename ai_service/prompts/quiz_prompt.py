"""Prompt construction for LLM-based quiz generation — multi-type support."""

from __future__ import annotations

import json
from typing import Sequence

# ---------------------------------------------------------------------------
# Example outputs per type — kept short; actual generation uses user prompt
# ---------------------------------------------------------------------------
_MCQ_EXAMPLE = {
    "id": "q1",
    "question_text": "What is the primary site of photosynthesis in plant cells?",
    "type": "mcq",
    "options": ["Mitochondria", "Chloroplast", "Ribosome", "Nucleus"],
    "correct_answer": "Chloroplast",
    "explanation": "Chloroplasts contain chlorophyll and carry out the light-dependent and Calvin cycle reactions.",
}

_TF_EXAMPLE = {
    "id": "q2",
    "question_text": "Plants absorb carbon dioxide and release oxygen during photosynthesis.",
    "type": "true_false",
    "options": ["True", "False"],
    "correct_answer": "True",
    "explanation": "During photosynthesis, CO2 is consumed and O2 is released as a by-product.",
}

_FILL_EXAMPLE = {
    "id": "q3",
    "question_text": "The organelle responsible for photosynthesis is the ______.",
    "type": "fill_blank",
    "options": None,
    "correct_answer": "chloroplast",
    "explanation": "The blank should be filled with 'chloroplast'.",
}

_SA_EXAMPLE = {
    "id": "q4",
    "question_text": "Explain in one sentence why plants appear green.",
    "type": "short_answer",
    "options": None,
    "correct_answer": "Plants appear green because chlorophyll absorbs red and blue light while reflecting green wavelengths.",
    "explanation": "This is a model answer; partial credit for equivalent explanations.",
}

_CODING_EXAMPLE = {
    "id": "q5",
    "question_text": (
        "Write a function `binary_search(arr, target)` that returns the index of `target` "
        "in sorted array `arr`, or -1 if not found. Use O(log n) time complexity.\n\n"
        "Input: arr=[1,3,5,7,9], target=5\nOutput: 2"
    ),
    "type": "coding",
    "options": None,
    "correct_answer": (
        "def binary_search(arr, target):\n"
        "    lo, hi = 0, len(arr) - 1\n"
        "    while lo <= hi:\n"
        "        mid = (lo + hi) // 2\n"
        "        if arr[mid] == target: return mid\n"
        "        elif arr[mid] < target: lo = mid + 1\n"
        "        else: hi = mid - 1\n"
        "    return -1"
    ),
    "explanation": "Standard iterative binary search with O(log n) time and O(1) space.",
}

_TYPE_EXAMPLES: dict[str, dict] = {
    "mcq": _MCQ_EXAMPLE,
    "true_false": _TF_EXAMPLE,
    "fill_blank": _FILL_EXAMPLE,
    "short_answer": _SA_EXAMPLE,
    "coding": _CODING_EXAMPLE,
}

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a highly accurate educational quiz-generator.
Your only job is to produce quiz questions in the exact JSON format requested.

ABSOLUTE RULES — follow without exception:
1. Respond with ONLY a valid JSON array — no prose, no markdown fences, no commentary.
2. Every object must have these keys: "id", "question_text", "type", "options", "correct_answer", "explanation".
3. "id" must be a string like "q1", "q2", ... "qN" (sequential from q1).
4. "type" must be one of: "mcq", "true_false", "fill_blank", "short_answer", "coding".
5. For "mcq": "options" = JSON array of exactly 4 distinct strings; "correct_answer" = verbatim one of those 4.
6. For "true_false": "options" = ["True","False"]; "correct_answer" = "True" or "False".
7. For "fill_blank": "options" = null; question must contain exactly one "______" placeholder; "correct_answer" = the word/phrase for the blank (lowercase).
8. For "short_answer": "options" = null; "correct_answer" = concise model answer (1-3 sentences).
9. For "coding": "options" = null; question includes problem statement, example input/output; "correct_answer" = a correct implementation.
10. "explanation" = brief explanation of the correct answer (1-2 sentences).
11. Do NOT include any extra fields.
12. Do NOT wrap JSON in markdown code blocks or backticks.
13. Every question must be specifically about the requested topic.\
"""

# ---------------------------------------------------------------------------
# Difficulty guidance
# ---------------------------------------------------------------------------
_DIFFICULTY_GUIDANCE: dict[str, str] = {
    "easy": (
        "Focus on definitions, basic recall, and straightforward concepts. "
        "Avoid tricky wording. MCQs should have one clearly correct answer."
    ),
    "medium": (
        "Include both recall and application questions. "
        "Distractors should be plausible but clearly wrong to a student who understands the topic."
    ),
    "hard": (
        "Emphasise analysis, evaluation, and edge-case reasoning. "
        "Distractors should be highly plausible. Coding questions should require optimization or handling edge cases."
    ),
    "mixed": (
        "Mix easy, medium, and hard questions. Annotate each with appropriate cognitive depth."
    ),
}


# ---------------------------------------------------------------------------
# Distribution helper
# ---------------------------------------------------------------------------
def _compute_distribution(
    question_types: Sequence[str],
    n_questions: int,
) -> dict[str, int]:
    """Evenly distribute n_questions across the requested types."""
    types = list(question_types)
    if not types:
        return {"mcq": n_questions}
    base, remainder = divmod(n_questions, len(types))
    dist: dict[str, int] = {}
    for i, t in enumerate(types):
        dist[t] = base + (1 if i < remainder else 0)
    return dist


# ---------------------------------------------------------------------------
# Public builder
# ---------------------------------------------------------------------------
def build_quiz_prompt(
    topic: str,
    difficulty: str,
    n_questions: int = 5,
    question_types: Sequence[str] | None = None,
    pdf_context: str | None = None,
    pdf_source_mode: str | None = None,
) -> list[dict[str, str]]:
    """Build OpenAI-compatible messages for multi-type quiz generation.

    Args:
        topic: Human-readable topic label (e.g. "Binary Search").
        difficulty: One of 'easy' | 'medium' | 'hard' | 'mixed'.
        n_questions: Exact number of questions to generate (1-30).
        question_types: List of question types to include. Defaults to ["mcq"].
        pdf_context: Optional PDF content text to ground questions in.
        pdf_source_mode: "topic_knowledge", "pdf_only", or "topic_pdf".

    Returns:
        List of message dicts for any OpenAI-compatible Chat Completions call.

    Raises:
        ValueError: If any argument fails basic validation.
    """
    if not isinstance(topic, str) or not topic.strip():
        raise ValueError("topic must be a non-empty string")
    valid_difficulties = ("easy", "medium", "hard", "mixed")
    if difficulty not in valid_difficulties:
        raise ValueError(f"difficulty must be one of {valid_difficulties}")
    if not isinstance(n_questions, int) or n_questions < 1:
        raise ValueError("n_questions must be a positive integer")

    if question_types is None:
        question_types = ["mcq"]

    valid_types = {"mcq", "true_false", "fill_blank", "short_answer", "coding"}
    for qt in question_types:
        if qt not in valid_types:
            raise ValueError(f"Unknown question type: {qt}")

    difficulty_guidance = _DIFFICULTY_GUIDANCE.get(difficulty, _DIFFICULTY_GUIDANCE["medium"])
    distribution = _compute_distribution(question_types, n_questions)

    # Build distribution description
    dist_lines = "\n".join(
        f"  - {count} question(s) of type \"{qtype}\""
        for qtype, count in distribution.items()
        if count > 0
    )

    # Pick one example per requested type to show the model
    example_objs = [_TYPE_EXAMPLES[t] for t in question_types if t in _TYPE_EXAMPLES]
    example_json = json.dumps(example_objs, indent=2)

    # Build context instruction based on PDF mode
    context_instruction = ""
    if pdf_source_mode == "pdf_only" and pdf_context:
        context_instruction = f"""
IMPORTANT: Generate ALL questions based ONLY on the following PDF content. Do not use general knowledge.

PDF CONTENT:
{pdf_context}

Questions must be answerable from the above content. If the content is insufficient, still generate questions based on what IS available.
"""
    elif pdf_source_mode == "topic_pdf" and pdf_context:
        context_instruction = f"""
You may use both general knowledge about "{topic.strip()}" AND the following PDF content to generate questions.

PDF CONTENT:
{pdf_context}

Prefer questions that can be grounded in the PDF content, but you may supplement with general knowledge when needed.
"""
    elif pdf_source_mode == "topic_knowledge":
        context_instruction = f"""
Generate questions based on general knowledge about "{topic.strip()}" using standard educational resources.
"""

    user_prompt = f"""\
Generate exactly {n_questions} quiz questions about "{topic.strip()}" at {difficulty.upper()} difficulty.

Difficulty guidance: {difficulty_guidance}

Required question type distribution:
{dist_lines}

{context_instruction}

ALL questions must be specifically about "{topic.strip()}". Do NOT include questions about unrelated topics.

For coding questions, use realistic coding problems directly related to the topic.
For fill_blank questions, the blank marker must be exactly "______" (6 underscores).

OUTPUT FORMAT — return ONLY a valid JSON array, nothing else.
Here are worked examples showing the exact required shape (topic: Photosynthesis):

{example_json}

Now generate exactly {n_questions} question(s) about "{topic.strip()}" at {difficulty.upper()} difficulty \
with the distribution shown above. IDs must start from "q1" sequentially.\
"""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
