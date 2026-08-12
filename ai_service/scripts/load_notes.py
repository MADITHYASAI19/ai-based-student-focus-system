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

# Mapping of note files to subject names (look up IDs dynamically)
NOTE_TO_SUBJECT_NAME = {
    "math_notes.txt": "Mathematics",
    "physics_notes.txt": "Mathematics",
    "biology_notes.txt": "Biology",
}

SAMPLE_QUERY = "What does the discriminant tell us about a quadratic equation?"


def main(subject_id: int = None) -> None:
    """Embed the sample notes and print a retrieval sanity check.
    
    Args:
        subject_id: If provided, load notes into subject_{subject_id} collection.
                   If None, load all notes into their respective subject collections.
    """
    from app.core.database import SessionLocal
    from app.models.models import Subject
    
    db = SessionLocal()
    
    try:
        # Build subject name to ID mapping
        subject_map = {s.name: s.id for s in db.query(Subject).all()}
        
        total_chunks = 0
        
        for note_path in sorted(SAMPLE_NOTES_DIR.glob("*.txt")):
            # Determine which subject this note belongs to
            subject_name = NOTE_TO_SUBJECT_NAME.get(note_path.name)
            
            if subject_name is None:
                print(f"Warning: No subject mapping for {note_path.name}, skipping")
                continue
            
            if subject_name not in subject_map:
                print(f"Warning: Subject '{subject_name}' not found in database, skipping {note_path.name}")
                continue
            
            note_subject_id = subject_map[subject_name]
            
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
            math_id = subject_map.get("Mathematics")
            if math_id:
                results = query(f"subject_{math_id}", SAMPLE_QUERY, top_k=3)
            else:
                print("Warning: Mathematics subject not found, skipping sample query")
                results = []
        
        for rank, result in enumerate(results, start=1):
            source = result["metadata"].get("source_file", "unknown source")
            preview = " ".join(result["text"].split())
            print(f"{rank}. score={result['similarity_score']:.3f} source={source}")
            try:
                print(f"   {preview[:220]}")
            except UnicodeEncodeError:
                print(f"   [Preview contains special characters]")
    
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load sample notes into ChromaDB")
    parser.add_argument("--subject-id", type=int, help="Load notes for specific subject ID only")
    args = parser.parse_args()
    
    main(subject_id=args.subject_id)
