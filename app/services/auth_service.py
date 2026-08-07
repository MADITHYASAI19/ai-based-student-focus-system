from typing import Optional
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.models import User, Role


class EmailAlreadyExistsError(Exception):
    """Raised when a registration email is already in use."""


def register_user(
    db: Session,
    email: str,
    password: str,
    name: str,
    role: Optional[str] = None
) -> User:
    """Register a new user with hashed password."""
    if db.query(User).filter(User.email == email).first():
        raise EmailAlreadyExistsError

    if role is None:
        role = Role.STUDENT
    
    # Validate role
    try:
        Role(role)
    except ValueError:
        role = Role.STUDENT
    
    hashed_password = hash_password(password)
    db_user = User(
        email=email,
        password_hash=hashed_password,
        name=name,
        role=role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password.
    
    Returns the User object if credentials are valid, None otherwise.
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
