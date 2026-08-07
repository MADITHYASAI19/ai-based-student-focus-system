from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base


class Role(str, Enum):
    STUDENT = "student"
    PARENT = "parent"
    TEACHER = "teacher"
    ADMIN = "admin"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class PlanStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ItemStatus(str, Enum):
    PENDING = "pending"
    DONE = "done"
    SKIPPED = "skipped"


class FocusEventType(str, Enum):
    PHONE_DETECTED = "phone_detected"
    AWAY = "away"
    SLEEPY = "sleepy"
    TAB_SWITCH = "tab_switch"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default=Role.STUDENT)
    grade_level: Mapped[str | None] = mapped_column(String, nullable=True)
    target_exam: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    parent: Mapped["User"] = relationship("User", remote_side=[id], back_populates="children")
    children: Mapped[list["User"]] = relationship("User", back_populates="parent")
    study_plans: Mapped[list["StudyPlan"]] = relationship("StudyPlan", back_populates="student")
    study_sessions: Mapped[list["StudySession"]] = relationship("StudySession", back_populates="student", cascade="all, delete-orphan")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    # Relationships
    topics: Mapped[list["Topic"]] = relationship("Topic", back_populates="subject")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject_id: Mapped[int] = mapped_column(Integer, ForeignKey("subjects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    difficulty: Mapped[str] = mapped_column(String, nullable=False, default=Difficulty.MEDIUM)
    estimated_hours: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    subject: Mapped["Subject"] = relationship("Subject", back_populates="topics")
    plan_items: Mapped[list["PlanItem"]] = relationship("PlanItem", back_populates="topic")


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    exam_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default=PlanStatus.PENDING)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    student: Mapped["User"] = relationship("User", back_populates="study_plans")
    plan_items: Mapped[list["PlanItem"]] = relationship("PlanItem", back_populates="study_plan", cascade="all, delete-orphan")


class PlanItem(Base):
    __tablename__ = "plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plan_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_plans.id"), nullable=False)
    topic_id: Mapped[int] = mapped_column(Integer, ForeignKey("topics.id"), nullable=False)
    scheduled_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default=ItemStatus.PENDING)

    # Relationships
    study_plan: Mapped["StudyPlan"] = relationship("StudyPlan", back_populates="plan_items")
    topic: Mapped["Topic"] = relationship("Topic", back_populates="plan_items")
    study_sessions: Mapped[list["StudySession"]] = relationship("StudySession", back_populates="plan_item")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    plan_item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("plan_items.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    focus_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    productivity_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relationships
    student: Mapped["User"] = relationship("User", back_populates="study_sessions")
    plan_item: Mapped["PlanItem | None"] = relationship("PlanItem", back_populates="study_sessions")
    focus_events: Mapped[list["FocusEvent"]] = relationship("FocusEvent", back_populates="session", cascade="all, delete-orphan")


class FocusEvent(Base):
    __tablename__ = "focus_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("study_sessions.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    session: Mapped["StudySession"] = relationship("StudySession", back_populates="focus_events")

