"""
Create a test user for the focus tracker.
"""
import requests
import hashlib

API_URL = "http://localhost:8000"

def create_user(email: str, password: str, name: str):
    """Create a new user via the API."""
    try:
        response = requests.post(
            f"{API_URL}/api/auth/register",
            json={
                "email": email,
                "password": password,
                "name": name,
                "role": "student"
            },
            timeout=10
        )
        
        if response.status_code == 201:
            print(f"[OK] User created successfully!")
            print(f"  Email: {email}")
            print(f"  Password: {password}")
            print(f"  Name: {name}")
            return True
        else:
            print(f"[ERROR] Failed to create user: {response.status_code}")
            print(f"  {response.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        return False

if __name__ == "__main__":
    print("Creating test user for focus tracker...")
    print("=" * 60)
    
    # Create a test user
    success = create_user(
        email="testuser@example.com",
        password="test123456",
        name="Test User"
    )
    
    if success:
        print("\nNow you can login with:")
        print("  python session_focus_tracker.py --debug --email testuser@example.com --password test123456")
