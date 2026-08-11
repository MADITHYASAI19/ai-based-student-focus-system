"""
Live API test for similarity threshold validation.

Tests 5 questions through the full RAG pipeline to validate the
similarity threshold (0.3) and report confidence levels for tuning decisions.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from ai_service.embeddings.store import query
from ai_service.generation.doubt_solver import answer_doubt


# Test cases: (question, category)
# Categories: on-topic, off-topic, borderline
TEST_CASES = [
    # On-topic questions (should be high confidence)
    ("What is the function of mitochondria in cells?", "on-topic"),
    ("What does the discriminant tell us about quadratic equations?", "on-topic"),
    
    # Off-topic questions (should be low confidence)
    ("Who was the first president of the United States?", "off-topic"),
    ("What is the capital of France?", "off-topic"),
    
    # Borderline/ambiguous question
    ("How do cells generate energy?", "borderline"),
]


def run_test(question: str, category: str) -> dict:
    """Run a single test through the full pipeline."""
    try:
        # Step 1: Retrieve context chunks from ChromaDB
        results = query("subject_test", question, top_k=5)
        
        if not results:
            return {
                "question": question,
                "category": category,
                "top_similarity": 0.0,
                "confidence": "low",
                "answer": "No chunks retrieved"
            }
        
        # Step 2: Get top similarity score
        top_similarity = results[0].get("similarity_score", 0.0)
        
        # Step 3: Pass through answer_doubt (includes similarity threshold check)
        answer = answer_doubt(question, results)
        
        return {
            "question": question,
            "category": category,
            "top_similarity": top_similarity,
            "confidence": answer.confidence,
            "answer": answer.answer_text[:200] + "..." if len(answer.answer_text) > 200 else answer.answer_text,
            "source_chunks": len(answer.source_chunk_ids)
        }
        
    except Exception as e:
        return {
            "question": question,
            "category": category,
            "top_similarity": 0.0,
            "confidence": "error",
            "answer": str(e),
            "source_chunks": 0
        }


def main():
    """Run all test cases and print results for threshold tuning."""
    print("=" * 100)
    print("SIMILARITY THRESHOLD VALIDATION TEST")
    print("=" * 100)
    print(f"Testing {len(TEST_CASES)} questions through full RAG pipeline")
    print(f"Current similarity threshold: 0.3")
    print()
    
    results = []
    
    for question, category in TEST_CASES:
        result = run_test(question, category)
        results.append(result)
        
        # Print result
        print(f"Category: {category}")
        print(f"Question: {question}")
        print(f"Top Similarity: {result['top_similarity']:.3f}")
        print(f"Confidence: {result['confidence']}")
        print(f"Source Chunks: {result['source_chunks']}")
        print(f"Answer: {result['answer']}")
        print("-" * 100)
    
    # Summary
    print("\nSUMMARY FOR THRESHOLD TUNING:")
    print("-" * 100)
    
    for result in results:
        status = "OK" if (
            (result['category'] == 'on-topic' and result['confidence'] == 'high') or
            (result['category'] == 'off-topic' and result['confidence'] == 'low')
        ) else "?"
        
        print(f"{status} {result['category']:12} | Similarity: {result['top_similarity']:.3f} | Confidence: {result['confidence']}")
    
    print("-" * 100)
    print("\nRECOMMENDATIONS:")
    print("Review the borderline case and off-topic results to decide if threshold needs tuning.")
    print("Current threshold: 0.3")
    print("- On-topic should have similarity > 0.3 (high confidence)")
    print("- Off-topic should have similarity < 0.3 (low confidence)")
    print("- Borderline cases depend on content overlap")


if __name__ == "__main__":
    main()
