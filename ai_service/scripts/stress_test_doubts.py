"""
Stress test for doubt solver with expanded question set and categorical analysis.

Tests ~20 questions across 4 categories:
1. In-notes: Clearly covered by sample notes (expected: high confidence)
2. Out-of-notes: Completely unrelated topics (expected: low confidence)
3. Adjacent: Related to topic area but not directly covered (highest hallucination risk)
4. Adversarial: Sound like they're about the topic but ask unrelated questions

Reports pass rate by category to identify where the similarity threshold needs tuning.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from ai_service.embeddings.store import query
from ai_service.generation.doubt_solver import answer_doubt


# Test cases organized by category
TEST_CASES = {
    "in-notes": [
        # Biology
        ("What is the function of mitochondria in cells?", "high"),
        ("What is the difference between prokaryotic and eukaryotic cells?", "high"),
        ("What does the cell membrane do?", "high"),
        
        # Mathematics  
        ("What does the discriminant tell us about quadratic equations?", "high"),
        ("How do you find the vertex of a parabola?", "high"),
        
        # Physics
        ("What is Newton's second law of motion?", "high"),
        ("What is the relationship between force, mass, and acceleration?", "high"),
    ],
    
    "out-of-notes": [
        ("Who was the first president of the United States?", "low"),
        ("What is the capital of France?", "low"),
        ("How do you bake a chocolate cake?", "low"),
        ("What year did World War 2 end?", "low"),
        ("How do you play chess?", "low"),
    ],
    
    "adjacent": [
        # Biology-adjacent (related to cells but not covered)
        ("What is the process of photosynthesis?", "low"),  # Related to biology but not in cell structure notes
        ("How do vaccines work?", "low"),  # Biology-adjacent but not covered
        ("What is the function of the Golgi apparatus?", "low"),  # Cell organelle but not in notes
        
        # Math-adjacent (related to equations but not covered)
        ("What is the quadratic formula?", "high"),  # Might be covered - testing boundary
        ("How do you solve cubic equations?", "low"),  # Related to equations but not covered
        
        # Physics-adjacent
        ("What is the law of conservation of energy?", "low"),  # Physics but not in Newton's laws notes
        ("What is gravitational potential energy?", "low"),  # Physics-related but not covered
    ],
    
    "adversarial": [
        ("What is the function of mitochondria in the US government?", "low"),  # Sounds biological but asks about government
        ("What is the discriminant in criminal law?", "low"),  # Sounds mathematical but asks about law
        ("What is Newton's second law of thermodynamics?", "low"),  # Sounds like Newton's laws but asks about thermodynamics
        ("What are prokaryotic cells in computer science?", "low"),  # Sounds like biology but asks about CS
    ],
}


def run_test(question: str, expected_confidence: str) -> tuple[bool, str, str]:
    """Run a single test through the full pipeline."""
    try:
        # Retrieve context chunks from ChromaDB
        results = query("subject_1", question, top_k=5)
        
        if not results:
            return (False, "low", "No chunks retrieved")
        
        # Pass through answer_doubt (includes similarity threshold check)
        answer = answer_doubt(question, results)
        actual_confidence = answer.confidence
        
        # Compare with expected
        passed = actual_confidence == expected_confidence
        
        if passed:
            reason = "PASS"
        else:
            reason = f"Expected {expected_confidence}, got {actual_confidence}"
        
        return (passed, actual_confidence, reason)
        
    except Exception as e:
        return (False, "error", str(e))


def main():
    """Run all test cases and print categorical pass rates."""
    print("=" * 100)
    print("DOUBT SOLVER STRESS TEST - CATEGORICAL ANALYSIS")
    print("=" * 100)
    print(f"Testing across {len(TEST_CASES)} categories")
    print(f"Total questions: {sum(len(cases) for cases in TEST_CASES.values())}")
    print(f"Similarity threshold: 0.3")
    print()
    
    # Track results by category
    category_results = {
        category: {"total": 0, "passed": 0, "failed": 0, "results": []}
        for category in TEST_CASES.keys()
    }
    
    overall_passed = 0
    overall_failed = 0
    
    # Print header
    print(f"{'Category':<12} {'#':<3} {'Status':<6} {'Expected':<6} {'Actual':<6} {'Question':<50}")
    print("-" * 100)
    
    for category, cases in TEST_CASES.items():
        for i, (question, expected) in enumerate(cases, start=1):
            category_results[category]["total"] += 1
            
            test_passed, actual, reason = run_test(question, expected)
            
            category_results[category]["results"].append({
                "question": question,
                "expected": expected,
                "actual": actual,
                "passed": test_passed,
                "reason": reason
            })
            
            if test_passed:
                category_results[category]["passed"] += 1
                overall_passed += 1
                status = "PASS"
            else:
                category_results[category]["failed"] += 1
                overall_failed += 1
                status = "FAIL"
            
            # Truncate question for display
            display_question = question[:47] + "..." if len(question) > 47 else question
            
            print(f"{category:<12} {i:<3} {status:<6} {expected:<6} {actual:<6} {display_question:<50}")
            
            if not test_passed:
                print(f"             Reason: {reason}")
    
    print("-" * 100)
    print("\nCATEGORICAL PASS RATES:")
    print("=" * 100)
    
    for category, stats in category_results.items():
        total = stats["total"]
        passed = stats["passed"]
        pass_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"{category.upper():<12}: {passed}/{total} passed ({pass_rate:.1f}%)")
        
        # Show failed questions for this category
        if stats["failed"] > 0:
            print(f"             Failed questions:")
            for result in stats["results"]:
                if not result["passed"]:
                    print(f"             - {result['question'][:60]}... (expected: {result['expected']}, got: {result['actual']})")
    
    print("=" * 100)
    print(f"OVERALL: {overall_passed}/{overall_passed + overall_failed} passed ({(overall_passed / (overall_passed + overall_failed) * 100):.1f}%)")
    print("=" * 100)
    
    # Analysis and recommendations
    print("\nANALYSIS:")
    print("-" * 100)
    
    # Check the adjacent category specifically (highest risk)
    adjacent_stats = category_results["adjacent"]
    adjacent_rate = (adjacent_stats["passed"] / adjacent_stats["total"] * 100) if adjacent_stats["total"] > 0 else 0
    
    print(f"ADJACENT-TOPIC CATEGORY (highest hallucination risk): {adjacent_rate:.1f}% pass rate")
    
    if adjacent_rate < 80:
        print("⚠️  WARNING: Adjacent-topic pass rate below 80% - consider tuning similarity threshold")
    elif adjacent_rate < 90:
        print("⚠️  CAUTION: Adjacent-topic pass rate could be improved - monitor closely")
    else:
        print("✅ GOOD: Adjacent-topic pass rate is acceptable")
    
    # Check adversarial category
    adversarial_stats = category_results["adversarial"]
    adversarial_rate = (adversarial_stats["passed"] / adversarial_stats["total"] * 100) if adversarial_stats["total"] > 0 else 0
    
    print(f"ADVERSARY CATEGORY: {adversarial_rate:.1f}% pass rate")
    
    if adversarial_rate < 100:
        print("⚠️  WARNING: Adversarial questions getting through - this is a security concern")
    else:
        print("✅ GOOD: All adversarial questions correctly rejected")
    
    # Exit with error code if any tests failed
    if overall_failed > 0:
        print("\n⚠️  STRESS TEST FAILED: Some confidence predictions were incorrect")
        print("Review categorical results above to identify which categories need attention")
        sys.exit(1)
    else:
        print("\n✅ STRESS TEST PASSED: All confidence predictions correct across all categories")
        sys.exit(0)


if __name__ == "__main__":
    main()
