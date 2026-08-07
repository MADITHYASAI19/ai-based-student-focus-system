import os
import tiktoken
from pathlib import Path

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ai_service.preprocessing.cleaner import clean_text
from ai_service.preprocessing.chunker import chunk_text


def test_pipeline() -> None:
    """Test the preprocessing pipeline on sample notes.

    Processes each .txt file in sample_notes/ through clean_text() and chunk_text(),
    then prints statistics about the processing.
    """
    sample_dir = Path(__file__).parent / "sample_notes"
    encoding = tiktoken.get_encoding("cl100k_base")

    if not sample_dir.exists():
        print(f"Error: Sample notes directory not found at {sample_dir}")
        return

    txt_files = list(sample_dir.glob("*.txt"))

    if not txt_files:
        print(f"No .txt files found in {sample_dir}")
        return

    print("=" * 60)
    print("Preprocessing Pipeline Test")
    print("=" * 60)

    for file_path in txt_files:
        try:
            # Read file
            with open(file_path, 'r', encoding='utf-8') as f:
                original_text = f.read()

            # Clean text
            cleaned_text = clean_text(original_text)

            # Chunk text
            chunks = chunk_text(cleaned_text, chunk_size=500, overlap=50)

            # Calculate statistics
            original_chars = len(original_text)
            cleaned_chars = len(cleaned_text)
            num_chunks = len(chunks)

            # Estimate tokens per chunk
            tokens_per_chunk = []
            for chunk in chunks:
                tokens = len(encoding.encode(chunk))
                tokens_per_chunk.append(tokens)

            avg_tokens = sum(tokens_per_chunk) / len(tokens_per_chunk) if tokens_per_chunk else 0

            # Print results
            print(f"\nFile: {file_path.name}")
            print(f"  Characters (before cleaning): {original_chars}")
            print(f"  Characters (after cleaning):  {cleaned_chars}")
            print(f"  Number of chunks:             {num_chunks}")
            print(f"  Average tokens per chunk:     {avg_tokens:.1f}")

        except Exception as e:
            print(f"\nFile: {file_path.name}")
            print(f"  Error: {e}")
            continue

    print("\n" + "=" * 60)
    print("Pipeline test completed")
    print("=" * 60)


if __name__ == "__main__":
    test_pipeline()
