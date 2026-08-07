# AI Service Package

A pure Python package for AI/ML operations in the AI Study Companion platform. This package is designed to be used standalone without any FastAPI dependencies, making it suitable for independent testing, CLI tools, or integration with other frameworks.

## Pipeline Stages

The AI service follows a three-stage pipeline:

### 1. Preprocessing
- **Location**: `ai_service/preprocessing/`
- **Purpose**: Text cleaning, normalization, and document parsing
- **Functions**:
  - Text cleaning and normalization
  - PDF document parsing (using pypdf)
  - Text chunking for embedding generation
  - Data validation and formatting

### 2. Embeddings
- **Location**: `ai_service/embeddings/`
- **Purpose**: Vector generation for RAG (Retrieval-Augmented Generation)
- **Functions**:
  - Text embedding generation (using tiktoken for tokenization)
  - ChromaDB integration for vector storage
  - Similarity search and retrieval
  - Batch embedding processing

### 3. Generation
- **Location**: `ai_service/generation/`
- **Purpose**: LLM-based content generation
- **Functions**:
  - Quiz question generation
  - Study plan generation
  - Doubt resolution (RAG-based answers)
  - Content summarization

### 4. Prompts
- **Location**: `ai_service/prompts/`
- **Purpose**: Prompt templates and management
- **Functions**:
  - Prompt template definitions
  - Dynamic prompt construction
  - Prompt optimization and formatting

## Installation

```bash
pip install -r ai_service/requirements.txt
```

## Local vector store

The embedding store uses ChromaDB's embedded persistent client by default. It
stores local vectors in `./chroma_data`, so local AI-service development does
not require Docker or a separate Chroma server. Docker is only needed for
Postgres and Redis when those services are not running natively.

To use a remote Chroma service in production, configure the environment
without changing code:

```bash
CHROMA_MODE=http
CHROMA_URL=http://your-chroma-host:8000
```

## Usage

This package can be used independently:

```python
from ai_service.preprocessing import clean_text
from ai_service.embeddings import generate_embeddings
from ai_service.generation import generate_quiz
```

## Dependencies

- `anthropic` - Claude API client
- `openai` - OpenAI API client
- `chromadb` - Vector database for embeddings
- `tiktoken` - Tokenization for embeddings
- `pypdf` - PDF document parsing
- `python-dotenv` - Environment variable management

 Important: This package does not import from FastAPI or the main `app/` package, ensuring it remains framework-agnostic and testable in isolation.
