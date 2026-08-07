from fastapi import APIRouter, Depends, Query, status

from app.deps import get_current_user
from app.models.models import User
from app.schemas.quiz import QuizOut, QuizQuestion

router = APIRouter()


@router.get("/{topic_id}", response_model=QuizOut, status_code=status.HTTP_200_OK)
def get_quiz(
    topic_id: int,
    difficulty: str = Query(default="medium"),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a stubbed quiz for a given topic ID matching QuizOut schema."""
    questions = [
        QuizQuestion(
            id=1,
            question_text="What is the average time complexity of searching an element in a balanced Binary Search Tree (BST)?",
            type="mcq",
            options=["O(1)", "O(log n)", "O(n)", "O(n log n)"],
            correct_answer="O(log n)",
        ),
        QuizQuestion(
            id=2,
            question_text="Which data structure operates on a Last-In, First-Out (LIFO) principle?",
            type="mcq",
            options=["Queue", "Stack", "Array", "Linked List"],
            correct_answer="Stack",
        ),
        QuizQuestion(
            id=3,
            question_text="What is the primary advantage of a Hash Table for data lookup?",
            type="mcq",
            options=[
                "Guaranteed sorted elements",
                "Average O(1) time complexity for key lookup",
                "Minimal memory footprint",
                "Automatic graph traversal",
            ],
            correct_answer="Average O(1) time complexity for key lookup",
        ),
    ]

    return QuizOut(
        topic_id=topic_id,
        difficulty=difficulty,
        questions=questions,
    )
