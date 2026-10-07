from pypdf import PdfReader
import sys
path = sys.argv[1]
text = "\n".join(p.extract_text() or "" for p in PdfReader(path).pages)
print("1 EXTRACT chars:", len(text.strip()))

from ai_service.preprocessing.chunker import chunk_text
chunks = chunk_text(text, chunk_size=300, overlap=30)
print("2 CHUNK count:", len(chunks))

from ai_service.embeddings.embed import embed_chunks
emb = embed_chunks(chunks[:2])
print("3 EMBED dims:", len(emb[0]))

from ai_service.embeddings.store import upsert_document, query
upsert_document("debug_col", "doc_dbg", chunks, embed_chunks(chunks), {"source_file": "dbg"})
print("4 CHROMA ok")
print("5 QUERY:", query("debug_col", "main topic", top_k=2)[0]["text"][:120])

from ai_service.generation.document_analyzer import analyze_document
print("6 LLM:", analyze_document(text, "debug"))
