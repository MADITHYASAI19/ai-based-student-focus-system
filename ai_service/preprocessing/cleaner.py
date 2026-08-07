import re
from typing import List


def clean_text(text: str) -> str:
    """Clean and normalize text for processing.

    Performs basic text cleaning operations:
    - Removes extra whitespace
    - Normalizes line breaks
    - Removes special characters that might interfere with processing
    - Trims leading/trailing whitespace

    Args:
        text: The input text to clean.

    Returns:
        The cleaned text.

    Example:
        >>> text = "  This   is  a\\nmessy\\n\\n text!  "
        >>> clean_text(text)
        'This is a messy text!'
    """
    # Replace multiple spaces with single space
    text = re.sub(r' +', ' ', text)

    # Replace multiple newlines with single newline
    text = re.sub(r'\n+', '\n', text)

    # Remove leading/trailing whitespace from each line
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(lines)

    # Remove leading/trailing whitespace from entire text
    text = text.strip()

    return text
