"""Load the Day 1 sample notes into ChromaDB and verify semantic retrieval.

Run from the repository root:
    python ai_service/scripts/load_notes.py
"""

import argparse
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

# Mapping of note files to subject IDs
NOTE_TO_SUBJECT = {
    "math_notes.txt": 1,      # Mathematics (id=1)
    "physics_notes.txt": 1,    # Mathematics (id=1)
    "biology_notes.txt": 4,    # Biology (id=4)
}

SAMPLE_QUERY = "What does the discriminant tell us about a quadratic equation?"


def main(subject_id: int = None) -> None:
    """Embed the sample notes and print a retrieval sanity check.
    
    Args:
        subject_id: If provided, load notes into subject_{subject_id} collection.
                   If None, load all notes into their respective subject collections.
    """
    total_chunks = 0
    
    for note_path in sorted(SAMPLE_NOTES_DIR.glob("*.txt")):
        # Determine which subject this note belongs to
        note_subject_id = NOTE_TO_SUBJECT.get(note_path.name)
        
        # Skip if subject_id is specified and doesn't match
        if subject_id is not None and note_subject_id != subject_id:
            continue
        
        # Use specified subject_id or the note's default subject
        collection_subject_id = subject_id if subject_id is not None else note_subject_id
        collection_name = f"subject_{collection_subject_id}"
        
        cleaned_text = clean_text(note_path.read_text(encoding="utf-8"))
        chunks = chunk_text(cleaned_text, chunk_size=300, overlap=30)
        embeddings = embed_chunks(chunks)

        upsert_document(
            collection_name=collection_name,
            doc_id=note_path.stem,
            chunks=chunks,
            embeddings=embeddings,
            metadata={
                "source_file": note_path.name,
                "subject": note_path.stem.removesuffix("_notes"),
            },
        )
        total_chunks += len(chunks)
        print(f"Stored {len(chunks)} chunks from {note_path.name} into '{collection_name}'.")

    if subject_id is not None:
        print(f"\nStored {total_chunks} total chunks in 'subject_{subject_id}'.")
        print(f"\nSample query: {SAMPLE_QUERY}")
        results = query(f"subject_{subject_id}", SAMPLE_QUERY, top_k=3)
    else:
        print(f"\nStored {total_chunks} total chunks across all subject collections.")
        print(f"\nSample query: {SAMPLE_QUERY}")
        # Query the math collection for the sample query
        results = query("subject_1", SAMPLE_QUERY, top_k=3)
    
    for rank, result in enumerate(results, start=1):
        source = result["metadata"].get("source_file", "unknown source")
        preview = " ".join(result["text"].split())
        print(f"{rank}. score={result['similarity_score']:.3f} source={source}")
        try:
            print(f"   {preview[:220]}")
        except UnicodeEncodeError:
            print(f"   [Preview contains special characters]")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load sample notes into ChromaDB")
    parser.add_argument("--subject-id", type=int, help="Load notes for specific subject ID only")
    args = parser.parse_args()
    
    main(subject_id=args.subject_id)
