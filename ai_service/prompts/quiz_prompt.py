"""Prompt construction for LLM-based quiz generation."""

import json

# ---------------------------------------------------------------------------
# Worked example embedded in the prompt so the LLM has a concrete template
# to pattern-match against.  Uses Photosynthesis as the topic so it stays
# clearly distinct from whatever real topic the model is asked about.
# ---------------------------------------------------------------------------
_EXAMPLE_OUTPUT: str = json.dumps(
    [
        {
            "question_text": "What is the primary site of photosynthesis in plant cells?",
            "type": "mcq",
            "options": [
                "Mitochondria",
                "Chloroplast",
                "Ribosome",
                "Nucleus",
            ],
            "correct_answer": "Chloroplast",
        },
        {
            "question_text": "Which molecule is the main product of the light-dependent reactions?",
            "type": "mcq",
            "options": [
                "Glucose",
                "ATP",
                "Carbon dioxide",
                "Water",
            ],
            "correct_answer": "ATP",
        },
        {
            "question_text": (
                "In one sentence, explain why plants appear green to the human eye."
            ),
            "type": "short_answer",
            "options": None,
            "correct_answer": (
                "Plants appear green because chlorophyll absorbs red and blue light "
                "while reflecting green wavelengths."
            ),
        },
    ],
    indent=2,
)

# ---------------------------------------------------------------------------
# System prompt: instructs the model on its role and absolute constraints
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a highly accurate educational quiz-generator.
Your only job is to produce quiz questions in the exact JSON format requested.

Rules you MUST follow without exception:
1. Respond with ONLY a JSON array — no prose, no markdown fences, no commentary.
2. Every object in the array must have exactly four keys:
   "question_text", "type", "options", "correct_answer".
3. "type" must be either "mcq" or "short_answer".
4. For "mcq": "options" must be a JSON array of exactly 4 distinct, plausible strings.
   "correct_answer" must be verbatim identical to one of those 4 strings.
5. For "short_answer": "options" must be JSON null (not an empty array).
   "correct_answer" is a concise model answer (1–3 sentences).
6. Do NOT include any field not listed above (e.g. do not add an "id" field).
7. Do NOT wrap the JSON in markdown code blocks or backticks.
8. The array must contain exactly the number of questions requested.\
"""

# ---------------------------------------------------------------------------
# Public builder
# ---------------------------------------------------------------------------

def build_quiz_prompt(
    topic: str,
    difficulty: str,
    n_questions: int = 5,
) -> list[dict[str, str]]:
    """Build OpenAI-compatible messages for quiz generation.

    Args:
        topic: Subject matter the questions should cover (e.g. "Binary Trees").
        difficulty: One of 'easy' | 'medium' | 'hard' — controls cognitive depth.
        n_questions: Exact number of questions to generate (default 5).

    Returns:
        A list of message dicts ready for the ``messages`` parameter of any
        OpenAI-compatible Chat Completions API call.

    Raises:
        ValueError: If any argument fails basic validation.
    """
    if not isinstance(topic, str) or not topic.strip():
        raise ValueError("topic must be a non-empty string")
    if difficulty not in ("easy", "medium", "hard"):
        raise ValueError("difficulty must be 'easy', 'medium', or 'hard'")
    if not isinstance(n_questions, int) or n_questions < 1:
        raise ValueError("n_questions must be a positive integer")

    difficulty_guidance = {
        "easy": (
            "Focus on definitions, basic recall, and straightforward concepts. "
            "Avoid tricky wording."
        ),
        "medium": (
            "Include both recall and application questions. "
            "Distractors should be plausible but clearly wrong to a student who "
            "understands the topic."
        ),
        "hard": (
            "Emphasise analysis, evaluation, and edge-case reasoning. "
            "Distractors should be highly plausible and require careful thought to "
            "distinguish from the correct answer."
        ),
    }[difficulty]

    # Decide how many MCQs vs short-answer to request.
    # Rule: mostly MCQ, with roughly 1 short_answer per 4 MCQs (min 0 if <4 total).
    n_short = max(0, n_questions // 4)
    n_mcq = n_questions - n_short

    user_prompt = f"""\
Generate exactly {n_questions} quiz questions about "{topic.strip()}" \
at {difficulty.upper()} difficulty.

Difficulty guidance: {difficulty_guidance}

Mix of types required:
- {n_mcq} question(s) of type "mcq"
- {n_short} question(s) of type "short_answer"

OUTPUT FORMAT — you must return ONLY a valid JSON array, nothing else.
Here is a worked example (topic: Photosynthesis) so you can see the exact shape:

{_EXAMPLE_OUTPUT}

Now generate {n_questions} question(s) about "{topic.strip()}" at {difficulty.upper()} \
difficulty using the same format above.\
"""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
