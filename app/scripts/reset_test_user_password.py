"""
Reset test user password.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from app.core.database import SessionLocal
from app.models.models import User
from app.core.security import hash_password


def reset_test_user_password():
    """Reset test user password."""
    db = SessionLocal()
    
    try:
        # Find test user
        test_user = db.query(User).filter(User.email == "test@example.com").first()
        
        if not test_user:
            print("Test user not found!")
            return
        
        # Reset password
        test_user.password_hash = hash_password("test123")
        db.commit()
        
        print(f"Reset password for: {test_user.email}")
        print(f"New password: test123")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    reset_test_user_password()
