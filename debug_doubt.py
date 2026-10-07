import sys
from app.services.doubt_service import answer_doubt
r = answer_doubt(sys.argv[1], subject_id=1, topic_id=90, source_mode="pdf_only")
print("CHUNKS USED:", r.source_chunk_ids)
print("CONFIDENCE :", r.confidence)
print("ANSWER     :", r.answer_text[:600])
