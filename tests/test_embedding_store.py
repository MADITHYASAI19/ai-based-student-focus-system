from unittest.mock import Mock, patch

from ai_service.embeddings.store import query, upsert_document


@patch("ai_service.embeddings.store._get_collection")
def test_upsert_document_creates_chunk_ids_and_metadata(mock_collection):
    upsert_document(
        "subject_7",
        "notes-1",
        ["first", "second"],
        [[0.1], [0.2]],
        {"source": "lecture.pdf"},
    )

    mock_collection.return_value.upsert.assert_called_once_with(
        ids=["notes-1_0", "notes-1_1"],
        documents=["first", "second"],
        embeddings=[[0.1], [0.2]],
        metadatas=[
            {"source": "lecture.pdf", "document_id": "notes-1", "chunk_index": 0},
            {"source": "lecture.pdf", "document_id": "notes-1", "chunk_index": 1},
        ],
    )


@patch("ai_service.embeddings.store.embed_chunks", return_value=[[0.1, 0.2]])
@patch("ai_service.embeddings.store._get_collection")
def test_query_returns_text_metadata_and_similarity(mock_collection, mock_embed_chunks):
    collection = mock_collection.return_value
    collection.query.return_value = {
        "ids": [["notes-1_0"]],
        "documents": [["Binary trees have nodes."]],
        "metadatas": [[{"source": "lecture.pdf"}]],
        "distances": [[0.2]],
    }

    assert query("subject_7", "What is a binary tree?", top_k=3) == [
        {
            "id": "notes-1_0",
            "text": "Binary trees have nodes.",
            "metadata": {"source": "lecture.pdf"},
            "similarity_score": 0.8,
        }
    ]
    mock_embed_chunks.assert_called_once_with(["What is a binary tree?"])
    collection.query.assert_called_once_with(
        query_embeddings=[[0.1, 0.2]],
        n_results=3,
        include=["documents", "metadatas", "distances"],
    )
