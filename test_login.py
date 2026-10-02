"""
Test login functionality directly.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from app.core.database import SessionLocal
from app.models.models import User
from app.services.auth_service import authenticate_user
from app.core.security import create_access_token, verify_password


def test_login():
    """Test login with test user."""
    db = SessionLocal()
    
    try:
        # Check if test user exists
        test_user = db.query(User).filter(User.email == "test@example.com").first()
        
        if not test_user:
            print("Test user not found!")
            return
        
        print(f"Test user found: {test_user.email} (id={test_user.id})")
        print(f"Password hash: {test_user.password_hash[:50]}...")
        
        # Test password verification
        is_valid = verify_password("test123", test_user.password_hash)
        print(f"Password verification (test123): {is_valid}")
        
        # Test authentication
        user = authenticate_user(db, email="test@example.com", password="test123")
        if user:
            print(f"Authentication successful: {user.email}")
            
            # Create token
            token = create_access_token(data={"sub": str(user.id), "email": user.email})
            print(f"JWT Token created: {token[:50]}...")
            
            # Test token decode
            from app.core.security import decode_access_token
            payload = decode_access_token(token)
            print(f"Token payload: {payload}")
        else:
            print("Authentication failed!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    test_login()
