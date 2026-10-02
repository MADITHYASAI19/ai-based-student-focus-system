"""
Test API login endpoint.
"""

import requests
import json

# Test login endpoint
url = "http://localhost:8000/api/auth/login"
data = {
    "email": "test@example.com",
    "password": "test123"
}

print(f"Testing login to: {url}")
print(f"Data: {data}")

try:
    response = requests.post(url, json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        print(f"\nToken received: {token[:50]}...")
        
        # Test protected endpoint
        headers = {"Authorization": f"Bearer {token}"}
        profile_response = requests.get("http://localhost:8000/api/auth/me/profile", headers=headers)
        print(f"\nProfile Status: {profile_response.status_code}")
        print(f"Profile Response: {json.dumps(profile_response.json(), indent=2)}")
    else:
        print("Login failed!")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
