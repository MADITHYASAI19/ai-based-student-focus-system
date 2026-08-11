"""
Seed development data for the AI Study Companion.

Creates subjects and topics for testing. Idempotent - running multiple times
will not create duplicates.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from app.core.database import SessionLocal
from app.models.models import Subject, Topic


def seed_data():
    """Seed subjects and topics for development testing."""
    db = SessionLocal()
    
    try:
        # Create subjects (idempotent by name)
        subjects_data = [
            {"name": "Mathematics"},
            {"name": "Biology"},
        ]
        
        created_subjects = []
        existing_subjects = []
        subject_ids = {}  # Map name to ID
        
        for subject_data in subjects_data:
            subject = db.query(Subject).filter(Subject.name == subject_data["name"]).first()
            if subject:
                existing_subjects.append(subject.name)
                subject_ids[subject.name] = subject.id
                print(f"Subject already exists: {subject.name} (id={subject.id})")
            else:
                subject = Subject(**subject_data)
                db.add(subject)
                db.commit()
                db.refresh(subject)
                created_subjects.append(subject.name)
                subject_ids[subject.name] = subject.id
                print(f"Created subject: {subject.name} (id={subject.id})")
        
        # Create topics (idempotent by name)
        topics_data = [
            {
                "subject_id": subject_ids["Mathematics"],
                "name": "Quadratic Equations",
                "difficulty": "medium",
                "estimated_hours": 3
            },
            {
                "subject_id": subject_ids["Biology"],
                "name": "Cell Structure",
                "difficulty": "easy",
                "estimated_hours": 2
            },
        ]
        
        created_topics = []
        existing_topics = []
        
        for topic_data in topics_data:
            topic = db.query(Topic).filter(Topic.name == topic_data["name"]).first()
            if topic:
                existing_topics.append(topic.name)
                print(f"Topic already exists: {topic.name} (id={topic.id})")
            else:
                topic = Topic(**topic_data)
                db.add(topic)
                db.commit()
                db.refresh(topic)
                created_topics.append(topic.name)
                print(f"Created topic: {topic.name} (id={topic.id}, subject_id={topic.subject_id})")
        
        # Summary
        print("\n" + "=" * 60)
        print("SEED DATA SUMMARY")
        print("=" * 60)
        print(f"Subjects created: {len(created_subjects)}")
        print(f"Subjects already existed: {len(existing_subjects)}")
        print(f"Topics created: {len(created_topics)}")
        print(f"Topics already existed: {len(existing_topics)}")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()
