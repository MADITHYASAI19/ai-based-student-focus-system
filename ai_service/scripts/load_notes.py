"""Load the Day 1 sample notes into ChromaDB and verify semantic retrieval.

Run from the repository root:
    python ai_service/scripts/load_notes.py
"""

from pathlib import Path
import sys


# Support direct execution (`python ai_service/scripts/load_notes.py`) as well
# as module execution without coupling the AI package to FastAPI.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai_service.embeddings.embed import embed_chunks
from ai_service.embeddings.store import query, upsert_document
from ai_service.preprocessing.chunker import chunk_text
from ai_service.preprocessing.cleaner import clean_text


SAMPLE_NOTES_DIR = Path(__file__).resolve().parent / "sample_notes"
COLLECTION_NAME = "subject_test"
SAMPLE_QUERY = "What does the discriminant tell us about a quadratic equation?"


def main() -> None:
    """Embed the sample notes and print a retrieval sanity check."""
    total_chunks = 0

    for note_path in sorted(SAMPLE_NOTES_DIR.glob("*.txt")):
        cleaned_text = clean_text(note_path.read_text(encoding="utf-8"))
        chunks = chunk_text(cleaned_text, chunk_size=300, overlap=30)
        embeddings = embed_chunks(chunks)

        upsert_document(
            collection_name=COLLECTION_NAME,
            doc_id=note_path.stem,
            chunks=chunks,
            embeddings=embeddings,
            metadata={
                "source_file": note_path.name,
                "subject": note_path.stem.removesuffix("_notes"),
            },
        )
        total_chunks += len(chunks)
        print(f"Stored {len(chunks)} chunks from {note_path.name}.")

    print(f"\nStored {total_chunks} total chunks in '{COLLECTION_NAME}'.")
    print(f"\nSample query: {SAMPLE_QUERY}")

    results = query(COLLECTION_NAME, SAMPLE_QUERY, top_k=3)
    for rank, result in enumerate(results, start=1):
        source = result["metadata"].get("source_file", "unknown source")
        preview = " ".join(result["text"].split())
        print(f"{rank}. score={result['similarity_score']:.3f} source={source}")
        print(f"   {preview[:220]}")


if __name__ == "__main__":
    main()
