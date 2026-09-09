from unittest.mock import Mock, patch
import pytest

from ai_service.embeddings.embed import embed_chunks


def test_embed_chunks_empty_list():
    assert embed_chunks([]) == []


def test_embed_chunks_invalid_input():
    with pytest.raises(ValueError, match="chunks must contain only non-empty strings"):
        embed_chunks(["valid chunk", ""])

    with pytest.raises(ValueError, match="chunks must contain only non-empty strings"):
        embed_chunks(["   "])


@patch("ai_service.embeddings.embed._get_model")
def test_embed_chunks_success(mock_get_model):
    mock_model = Mock()
    mock_model.encode.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    mock_get_model.return_value = mock_model

    chunks = ["first chunk", "second chunk"]
    result = embed_chunks(chunks)

    mock_model.encode.assert_called_once_with(chunks, convert_to_numpy=False)
    assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

