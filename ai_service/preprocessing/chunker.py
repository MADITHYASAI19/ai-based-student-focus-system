import tiktoken
import logging
from pypdf import PdfReader
from typing import List

logger = logging.getLogger(__name__)

# Maximum token limit for input text to prevent oversized uploads
MAX_TOKEN_LIMIT = 50000


class NotesTooLargeError(Exception):
    """Raised when input text exceeds the maximum token limit."""
    pass


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks measured in tokens.

    Uses tiktoken's cl100k_base encoding for token counting, which is the
    same encoding used by GPT-4 and other modern OpenAI models.

    Args:
        text: The input text to chunk.
        chunk_size: Maximum number of tokens per chunk. Defaults to 500.
        overlap: Number of tokens to overlap between consecutive chunks. Defaults to 50.

    Returns:
        A list of text chunks, each containing at most chunk_size tokens.

    Raises:
        NotesTooLargeError: If the input text exceeds MAX_TOKEN_LIMIT.

    Example:
        >>> text = "This is a sample text that will be chunked into smaller pieces."
        >>> chunks = chunk_text(text, chunk_size=10, overlap=2)
        >>> len(chunks)
        2
        >>> chunks[0]
        'This is a sample text that will be'
        >>> chunks[1]
        'that will be chunked into smaller pieces.'
    """
    encoding = tiktoken.get_encoding("cl100k_base")
    tokens = encoding.encode(text)
    
    # Check token limit before processing
    if len(tokens) > MAX_TOKEN_LIMIT:
        logger.warning(
            f"Input text exceeds token limit: {len(tokens)} tokens (limit: {MAX_TOKEN_LIMIT}). "
            f"Rejecting to prevent oversized processing."
        )
        raise NotesTooLargeError(
            f"Input text exceeds maximum token limit of {MAX_TOKEN_LIMIT} tokens "
            f"(got {len(tokens)} tokens). Please split your content into smaller files."
        )

    chunks = []
    start = 0

    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)

        # Move start position with overlap
        start += chunk_size - overlap

        # If overlap is 0 or chunk_size <= overlap, prevent infinite loop
        if overlap >= chunk_size:
            start = end

        # If we've reached the end, break
        if start >= len(tokens):
            break

    return chunks


def chunk_pdf(file_path: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Extract text from a PDF file and split it into overlapping chunks.

    Uses pypdf to extract text from all pages of the PDF, then applies
    chunk_text to create token-based chunks.

    Args:
        file_path: Path to the PDF file.
        chunk_size: Maximum number of tokens per chunk. Defaults to 500.
        overlap: Number of tokens to overlap between consecutive chunks. Defaults to 50.

    Returns:
        A list of text chunks from the PDF.

    Example:
        >>> chunks = chunk_pdf("document.pdf", chunk_size=300, overlap=30)
        >>> len(chunks)
        15
    """
    reader = PdfReader(file_path)
    text_parts = []

    for page in reader.pages:
        text_parts.append(page.extract_text())

    full_text = "\n\n".join(text_parts)
    return chunk_text(full_text, chunk_size=chunk_size, overlap=overlap)
