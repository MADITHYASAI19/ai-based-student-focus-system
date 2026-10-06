from app.core.database import SessionLocal
from app.models.models import User
from app.core.security import hash_password

db = SessionLocal()
user = db.query(User).filter(User.email == 'student@studyplatform.local').first()
print('User exists:', user is not None)

if not user:
    user = User(
        email='student@studyplatform.local',
        password_hash=hash_password('StudentPass123!'),
        name='Demo Student',
        role='student'
    )
    db.add(user)
    db.commit()
    print('User created successfully')
else:
    print('User already exists with ID:', user.id)

db.close()
