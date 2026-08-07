from types import SimpleNamespace
from unittest.mock import Mock, patch

from ai_service.embeddings.embed import BATCH_SIZE, embed_chunks


def _response(count: int):
    return SimpleNamespace(
        data=[
            SimpleNamespace(index=index, embedding=[float(index)])
            for index in reversed(range(count))
        ]
    )


@patch("ai_service.embeddings.embed.OpenAI")
def test_embed_chunks_batches_and_preserves_input_order(mock_openai, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = mock_openai.return_value
    client.embeddings.create.side_effect = [_response(BATCH_SIZE), _response(1)]

    embeddings = embed_chunks([f"chunk {index}" for index in range(BATCH_SIZE + 1)])

    assert client.embeddings.create.call_count == 2
    assert embeddings[:3] == [[0.0], [1.0], [2.0]]
    assert embeddings[-1] == [0.0]


@patch("ai_service.embeddings.embed.time.sleep")
@patch("ai_service.embeddings.embed.OpenAI")
def test_embed_chunks_retries_failed_batch(mock_openai, mock_sleep, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = mock_openai.return_value
    client.embeddings.create.side_effect = [ConnectionError("temporary"), _response(1)]

    assert embed_chunks(["a chunk"]) == [[0.0]]
    assert client.embeddings.create.call_count == 2
    mock_sleep.assert_called_once_with(1)
