"""
Stress test for quiz generation across varied topics and difficulty levels.

Tests 8-10 topics across 3 difficulty levels (24-30 total calls).
Logs success/failure, time taken, and flags questionable outputs.
Writes failures and issues to known_issues.md for reproducibility.
"""

import sys
import os
import time
from datetime import datetime
from typing import List, Dict, Any

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from ai_service.generation.quiz_gen import generate_quiz


# Test topics: mix of tested and new ones (reduced for initial testing)
TOPICS = [
    "Quadratic Equations",           # Previously tested
    "Cell Structure",                # Previously tested  
    "Newton's Laws of Motion",        # Previously tested
    "Binary Search Trees",           # Computer science
    "Chemical Bonding",              # Chemistry
]

DIFFICULTIES = ["easy", "medium", "hard"]

# Track results
results: List[Dict[str, Any]] = []
issues: List[str] = []


def check_question_validity(question: Any) -> bool:
    """Check if the question's correct_answer matches one of its options."""
    # Handle both Pydantic models and dictionaries
    if hasattr(question, 'correct_answer'):
        correct_answer = question.correct_answer
        options = question.options if hasattr(question, 'options') else []
    else:
        correct_answer = question.get("correct_answer", "")
        options = question.get("options", [])
    
    if not options:
        return True  # Skip check if no options (might be open-ended)
    
    # Check if correct_answer exactly matches one of the options
    return correct_answer in options


def run_stress_test():
    """Run stress test across all topics and difficulty levels."""
    print("=" * 80)
    print("QUIZ GENERATION STRESS TEST")
    print("=" * 80)
    print(f"Testing {len(TOPICS)} topics x {len(DIFFICULTIES)} difficulties = {len(TOPICS) * len(DIFFICULTIES)} total calls")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    total_calls = 0
    successes = 0
    failures = 0
    questionable = 0

    for topic in TOPICS:
        for difficulty in DIFFICULTIES:
            total_calls += 1
            print(f"[{total_calls}/{len(TOPICS) * len(DIFFICULTIES)}] Testing: {topic} ({difficulty})")
            
            try:
                start_time = time.time()
                questions = generate_quiz(topic, difficulty, n_questions=5)
                elapsed_time = time.time() - start_time
                
                # Check question validity
                has_issues = False
                invalid_questions = []
                
                for i, question in enumerate(questions):
                    if not check_question_validity(question):
                        has_issues = True
                        invalid_questions.append(i + 1)
                
                result = {
                    "topic": topic,
                    "difficulty": difficulty,
                    "status": "success",
                    "time_taken": elapsed_time,
                    "num_questions": len(questions),
                    "has_issues": has_issues,
                    "invalid_questions": invalid_questions,
                }
                
                if has_issues:
                    questionable += 1
                    issue_msg = f"Question mismatch: {topic} ({difficulty}) - Invalid questions at indices: {invalid_questions}"
                    issues.append(issue_msg)
                    print(f"  ! SUCCESS ({elapsed_time:.2f}s) - {len(questions)} questions - ISSUE: {invalid_questions}")
                else:
                    successes += 1
                    print(f"  OK SUCCESS ({elapsed_time:.2f}s) - {len(questions)} questions")
                
                results.append(result)
                
            except Exception as e:
                failures += 1
                error_msg = f"Generation failed: {topic} ({difficulty}) - Error: {str(e)}"
                issues.append(error_msg)
                
                result = {
                    "topic": topic,
                    "difficulty": difficulty,
                    "status": "failure",
                    "time_taken": 0,
                    "error": str(e),
                }
                
                results.append(result)
                print(f"  X FAILED - {str(e)}")
            
            # Small delay to avoid overwhelming the API
            time.sleep(0.5)

    print()
    print("=" * 80)
    print("STRESS TEST SUMMARY")
    print("=" * 80)
    print(f"Total calls: {total_calls}")
    print(f"Successes: {successes}")
    print(f"Failures: {failures}")
    print(f"Questionable outputs: {questionable}")
    print(f"Success rate: {(successes / total_calls * 100):.1f}%")
    print()

    # Calculate average time for successful calls
    successful_times = [r["time_taken"] for r in results if r["status"] == "success"]
    if successful_times:
        avg_time = sum(successful_times) / len(successful_times)
        print(f"Average time per successful call: {avg_time:.2f}s")
        print(f"Min time: {min(successful_times):.2f}s")
        print(f"Max time: {max(successful_times):.2f}s")

    # Write issues to known_issues.md
    if issues:
        issues_path = os.path.join(os.path.dirname(__file__), "..", "known_issues.md")
        issues_path = os.path.abspath(issues_path)
        
        with open(issues_path, "w") as f:
            f.write("# Known Issues - Quiz Generation Stress Test\n\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total issues found: {len(issues)}\n\n")
            f.write("## Issues\n\n")
            
            for i, issue in enumerate(issues, 1):
                f.write(f"{i}. {issue}\n")
        
        print(f"\n! Issues written to: {issues_path}")
    else:
        print("\nOK No issues found - all outputs valid!")

    print("=" * 80)

    # Exit with error code if there were failures
    if failures > 0:
        print("\n! STRESS TEST FAILED: Some quiz generations failed")
        sys.exit(1)
    elif questionable > 0:
        print("\n! STRESS TEST WARNING: Some outputs have questionable content")
        sys.exit(1)
    else:
        print("\nOK STRESS TEST PASSED: All quiz generations successful and valid")
        sys.exit(0)


if __name__ == "__main__":
    run_stress_test()
