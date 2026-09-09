import sqlite3
from app.core.database import SessionLocal
from app.models.models import Topic, Subject

conn = sqlite3.connect('study_companion.db')
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print('Tables:', [t[0] for t in tables])
conn.close()

db = SessionLocal()
subjects = db.query(Subject).all()
for s in subjects:
    print(f'  Subject id={s.id}, name={s.name}')
topics = db.query(Topic).all()
for t in topics:
    print(f'  Topic id={t.id}, name={t.name}, subject_id={t.subject_id}')
db.close()
