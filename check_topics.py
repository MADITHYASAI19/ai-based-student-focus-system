from app.core.database import SessionLocal
from app.models.models import Topic

db = SessionLocal()
print('Topics:')
for t in db.query(Topic).all():
    print(f'  id={t.id}, name={t.name}, subject_id={t.subject_id}')
db.close()
