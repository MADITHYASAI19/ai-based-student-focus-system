"""Runs the REAL upload service against your REAL database, no HTTP. Prints the true traceback."""
import sys, io, traceback
from fastapi import UploadFile
from sqlalchemy import inspect
from app.core.database import SessionLocal, engine
from app.models.models import User
import app.services.document_service as svc

print("DB URL driver:", engine.url.drivername, "| db:", engine.url.database)
insp = inspect(engine)
need = {"study_documents": {"id","topic_id","uploaded_by","filename","stored_path","content_type","status",
        "error_message","concepts","structure","extracted_text","difficulty","difficulty_reason",
        "estimated_hours","uploaded_at","processed_at"}, "topics": {"id","subject_id","name","difficulty","estimated_hours"}}
for t, cols in need.items():
    if not insp.has_table(t):
        print(f"SCHEMA: table '{t}' MISSING -> run: python -m alembic upgrade head"); continue
    have = {c["name"] for c in insp.get_columns(t)}
    print(f"SCHEMA {t}: missing columns =", sorted(cols - have) or "none")

path = sys.argv[1]
data = open(path, "rb").read()
db = SessionLocal()
user = db.query(User).first()
print("Using user:", user.email if user else None)
upload = UploadFile(file=io.BytesIO(data), filename=path.split("\\")[-1].split("/")[-1],
                    headers={"content-type": "application/pdf"})
try:
    doc = svc.upload_doubt_document(db, user, upload)
    print("RESULT OK -> id", doc.id, "topic_id", doc.topic_id, "status", doc.status, "error", doc.error_message)
except Exception:
    print("RESULT FAILED. Real traceback:")
    traceback.print_exc()
    db.rollback()
