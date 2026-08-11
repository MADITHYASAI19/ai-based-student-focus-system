"""
Guardrail test for the doubt solver.

This script validates that the similarity threshold and confidence logic
correctly distinguish between on-topic and off-topic questions. It tests
the full RAG pipeline (retrieve → answer_doubt) and compares actual vs
expected confidence levels.

This is a critical guardrail to catch hallucination before it reaches users.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from ai_service.embeddings.store import query
from ai_service.generation.doubt_solver import answer_doubt


# Test cases: (question, expected_confidence)
# Half on-topic (should be answerable from notes), half off-topic (should fail threshold)
TEST_CASES = [
    # On-topic questions (expected: high confidence)
    ("What is the function of mitochondria in cells?", "high"),
    ("What does the discriminant tell us about quadratic equations?", "high"),
    ("What is Newton's second law of motion?", "high"),
    ("What is the difference between prokaryotic and eukaryotic cells?", "high"),
    ("How do you find the vertex of a parabola?", "high"),
    
    # Off-topic questions (expected: low confidence - should fail similarity threshold)
    ("Who was the first president of the United States?", "low"),
    ("What is the capital of France?", "low"),
    ("How do you bake a chocolate cake?", "low"),
    ("What is the history of the Roman Empire?", "low"),
    ("How do you play chess?", "low"),
]


def run_test(question: str, expected_confidence: str) -> tuple[bool, str, str]:
    """Run a single test through the full pipeline.
    
    Returns:
        (passed, actual_confidence, reason)
    """
    try:
        # Step 1: Retrieve context chunks from ChromaDB
        # Using subject_test collection from load_notes.py
        results = query("subject_test", question, top_k=5)
        
        if not results:
            return (False, "low", "No chunks retrieved")
        
        # Step 2: Pass through answer_doubt (includes similarity threshold check)
        answer = answer_doubt(question, results)
        actual_confidence = answer.confidence
        
        # Step 3: Compare with expected
        passed = actual_confidence == expected_confidence
        
        if passed:
            reason = "PASS"
        else:
            reason = f"Expected {expected_confidence}, got {actual_confidence}"
        
        return (passed, actual_confidence, reason)
        
    except Exception as e:
        return (False, "error", str(e))


def main():
    """Run all test cases and print a pass/fail table."""
    print("=" * 80)
    print("DOUBT SOLVER GUARDRAIL TEST")
    print("=" * 80)
    print(f"Testing {len(TEST_CASES)} questions through full RAG pipeline")
    print(f"Similarity threshold: 0.3")
    print()
    
    passed = 0
    failed = 0
    
    # Print header
    print(f"{'#':<3} {'Status':<6} {'Expected':<6} {'Actual':<6} {'Question':<50}")
    print("-" * 80)
    
    for i, (question, expected) in enumerate(TEST_CASES, start=1):
        test_passed, actual, reason = run_test(question, expected)
        
        if test_passed:
            passed += 1
            status = "PASS"
        else:
            failed += 1
            status = "FAIL"
        
        # Truncate question for display
        display_question = question[:47] + "..." if len(question) > 47 else question
        
        print(f"{i:<3} {status:<6} {expected:<6} {actual:<6} {display_question:<50}")
        
        if not test_passed:
            print(f"     Reason: {reason}")
    
    print("-" * 80)
    print(f"Results: {passed} passed, {failed} failed out of {len(TEST_CASES)} tests")
    print("=" * 80)
    
    # Exit with error code if any tests failed
    if failed > 0:
        print("\n[WARNING] GUARDRAIL TEST FAILED: Some off-topic questions may trigger hallucinations")
        sys.exit(1)
    else:
        print("\n[SUCCESS] GUARDRAIL TEST PASSED: Similarity threshold correctly filters off-topic queries")
        sys.exit(0)


if __name__ == "__main__":
    main()
