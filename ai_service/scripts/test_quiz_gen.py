"""
Manual eyeball script for quiz generation quality.

Run from project root:
    .alembic-venv\\Scripts\\python.exe ai_service/scripts/test_quiz_gen.py

Calls generate_quiz() for 9 combinations (3 topics × 3 difficulties), pretty-prints
every question, and flags MCQ questions where correct_answer doesn't exactly match
one of the options — catching that validation bug before Day 4 integration.
"""

import sys
from pathlib import Path

# Ensure UTF-8 output encoding for Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root is on the path regardless of working directory
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai_service.generation.quiz_gen import generate_quiz
from app.schemas.quiz import QuizQuestion

# ---------------------------------------------------------------------------
# Test matrix — topics mapped to the study platform's actual subject area
# ---------------------------------------------------------------------------
TEST_CASES: list[tuple[str, str]] = [
    ("Newton's Laws of Motion",      "easy"),
    ("Newton's Laws of Motion",      "hard"),
    ("Quadratic Equations",          "medium"),
    ("Quadratic Equations",          "hard"),
    ("Python Data Structures",       "easy"),
    ("Python Data Structures",       "medium"),
    ("Organic Chemistry Reactions",  "medium"),
    ("Probability and Statistics",   "easy"),
    ("Probability and Statistics",   "hard"),
]

# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

_PASS  = "[OK]"
_FAIL  = "[FLAG: correct_answer not in options!]"
_SEP   = "-" * 70


def _print_question(idx: int, q: QuizQuestion) -> bool:
    """Pretty-print one question. Returns True if valid, False if flagged."""
    print(f"\n  Q{idx}. [{q.type.upper()}] {q.question_text}")

    if q.type == "mcq":
        if q.options:
            for letter, opt in zip("ABCD", q.options):
                marker = "->" if opt == q.correct_answer else "  "
                print(f"       {marker} {letter}) {opt}")
        answer_valid = q.correct_answer in (q.options or [])
        flag = _PASS if answer_valid else _FAIL
        print(f"       Correct: {q.correct_answer!r}  {flag}")
        return answer_valid

    else:  # short_answer
        print(f"       Answer: {q.correct_answer}")
        if q.options is not None:
            print(f"       [FLAG: short_answer should have null options, got: {q.options}]")
            return False
        return True


def _run_case(topic: str, difficulty: str, n_questions: int = 5) -> dict:
    """Run one test case, return a result summary dict."""
    print(f"\n{'=' * 70}")
    print(f"  Topic: {topic}")
    print(f"  Difficulty: {difficulty.upper()}  |  Requested: {n_questions} questions")
    print(f"{'=' * 70}")

    flags: list[int] = []
    errors: list[str] = []

    try:
        questions = generate_quiz(topic=topic, difficulty=difficulty, n_questions=n_questions)
        print(f"  Received: {len(questions)} question(s)")

        for i, q in enumerate(questions, start=1):
            ok = _print_question(i, q)
            if not ok:
                flags.append(i)

    except Exception as exc:
        msg = f"  [ERROR] generate_quiz raised: {type(exc).__name__}: {exc}"
        print(msg)
        errors.append(str(exc))

    return {
        "topic": topic,
        "difficulty": difficulty,
        "flags": flags,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("\n" + "=" * 70)
    print("  Quiz Generation Quality Eyeball — AI Study Companion")
    print("=" * 70)

    results = []
    for topic, difficulty in TEST_CASES:
        result = _run_case(topic, difficulty)
        results.append(result)

    # ---------------------------------------------------------------------------
    # Summary table
    # ---------------------------------------------------------------------------
    print("\n\n" + "=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  {'Topic':<38} {'Diff':<8} {'Flags':<8} {'Errors'}")
    print(f"  {_SEP}")

    total_flags = 0
    total_errors = 0
    for r in results:
        flag_str  = f"Q{r['flags']}"  if r['flags']  else "none"
        error_str = f"{len(r['errors'])} error(s)" if r['errors'] else "none"
        total_flags  += len(r['flags'])
        total_errors += len(r['errors'])
        print(f"  {r['topic']:<38} {r['difficulty']:<8} {flag_str:<8} {error_str}")

    print(f"\n  Total MCQ answer-mismatch flags : {total_flags}")
    print(f"  Total generation errors         : {total_errors}")

    if total_flags or total_errors:
        print("\n  [WARNING] Action needed before Day 4 integration — see flagged rows above.")
        sys.exit(1)
    else:
        print("\n  [SUCCESS] All questions passed validation. Safe to wire in Day 4.")
        sys.exit(0)


if __name__ == "__main__":
    main()
