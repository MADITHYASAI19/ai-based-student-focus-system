from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine_options = {
    "pool_pre_ping": True,
}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    engine_options.update({"pool_size": 5, "max_overflow": 10, "pool_recycle": 1800})

engine = create_engine(settings.DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency injection for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
