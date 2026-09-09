"""add topic study documents and analysis

Revision ID: 20260909_1200
Revises: 1a418bbe8b2c
"""
from alembic import op
import sqlalchemy as sa


revision = "20260909_1200"
down_revision = "1a418bbe8b2c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("stored_path", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("concepts", sa.JSON(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=True),
        sa.Column("difficulty_reason", sa.Text(), nullable=True),
        sa.Column("estimated_hours", sa.Float(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_study_documents_id"), "study_documents", ["id"], unique=False)
    op.create_index(op.f("ix_study_documents_topic_id"), "study_documents", ["topic_id"], unique=False)
    op.create_index(op.f("ix_study_documents_uploaded_by"), "study_documents", ["uploaded_by"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_study_documents_uploaded_by"), table_name="study_documents")
    op.drop_index(op.f("ix_study_documents_topic_id"), table_name="study_documents")
    op.drop_index(op.f("ix_study_documents_id"), table_name="study_documents")
    op.drop_table("study_documents")