"""
Create a test user for development.

Creates a test student user if it doesn't already exist.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from app.core.database import SessionLocal
from app.models.models import User
from app.core.security import hash_password


def create_test_user():
    """Create a test user for development."""
    db = SessionLocal()
    
    try:
        # Check if test user already exists
        test_user = db.query(User).filter(User.email == "test@example.com").first()
        
        if test_user:
            print(f"Test user already exists: {test_user.email} (id={test_user.id})")
            print(f"Login credentials:")
            print(f"  Email: {test_user.email}")
            print(f"  Password: test123")
            return
        
        # Create test user
        test_user = User(
            email="test@example.com",
            password_hash=hash_password("test123"),
            name="Test Student",
            role="student",
            grade_level="10",
            target_exam="JEE"
        )
        
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        
        print(f"Created test user: {test_user.email} (id={test_user.id})")
        print(f"Login credentials:")
        print(f"  Email: test@example.com")
        print(f"  Password: test123")
        
    except Exception as e:
        db.rollback()
        print(f"Error creating test user: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_test_user()
