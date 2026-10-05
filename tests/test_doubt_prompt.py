from ai_service.prompts.doubt_prompt import build_doubt_prompt


def test_build_doubt_prompt_numbers_context_and_includes_guardrails():
    messages = build_doubt_prompt(
        "What does the discriminant tell us?",
        ["A positive discriminant gives two distinct real roots."],
    )

    assert messages[0]["role"] == "system"
    assert "You are an AI study companion" in messages[0]["content"]
    assert "clearly distinguish between information from the provided PDF context" in messages[0]["content"]
    # User message is now the last one (after optional conversation history)
    user_msg = messages[-1]["content"]
    assert "[Chunk 1]" in user_msg
    assert "What does the discriminant tell us?" in user_msg


def test_build_doubt_prompt_handles_no_retrieved_context():
    messages = build_doubt_prompt("What is photosynthesis?", [])

    # With conversation history support, the user message is now the last one
    user_msg = messages[-1]["content"]
    assert "(No context chunks were retrieved.)" in user_msg
