from app.core.database import SessionLocal
from app.models.models import StudyDocument
db = SessionLocal()
for d in db.query(StudyDocument).order_by(StudyDocument.id.desc()).limit(3):
    print(d.id, "|", d.filename, "|", d.status, "|", d.uploaded_at)
    print("   ERROR:", d.error_message)
