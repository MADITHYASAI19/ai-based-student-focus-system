from ai_service.prompts.doubt_prompt import build_doubt_prompt


def test_build_doubt_prompt_numbers_context_and_includes_guardrails():
    messages = build_doubt_prompt(
        "What does the discriminant tell us?",
        ["A positive discriminant gives two distinct real roots."],
    )

    assert messages[0]["role"] == "system"
    assert "Answer ONLY using the provided context chunks" in messages[0]["content"]
    assert "rather than guessing" in messages[0]["content"]
    assert "Cite every factual answer" in messages[0]["content"]
    assert "[Chunk 1]" in messages[1]["content"]
    assert "What does the discriminant tell us?" in messages[1]["content"]


def test_build_doubt_prompt_handles_no_retrieved_context():
    messages = build_doubt_prompt("What is photosynthesis?", [])

    assert "(No context chunks were retrieved.)" in messages[1]["content"]
