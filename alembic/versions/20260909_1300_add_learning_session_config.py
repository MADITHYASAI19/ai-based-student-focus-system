"""add structured document data and learning session configuration

Revision ID: 20260909_1300
Revises: 20260909_1200
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260909_1300"
down_revision = "20260909_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    document_columns = {column["name"] for column in inspector.get_columns("study_documents")}
    session_columns = {column["name"] for column in inspector.get_columns("study_sessions")}
    with op.batch_alter_table("study_documents") as batch:
        if "structure" not in document_columns:
            batch.add_column(sa.Column("structure", sa.JSON(), nullable=False, server_default="[]"))
        if "extracted_text" not in document_columns:
            batch.add_column(sa.Column("extracted_text", sa.Text(), nullable=True))
    with op.batch_alter_table("study_sessions") as batch:
        if "document_id" not in session_columns:
            batch.add_column(sa.Column("document_id", sa.Integer(), nullable=True))
        if "subtopic" not in session_columns:
            batch.add_column(sa.Column("subtopic", sa.String(), nullable=True))
        if "explanation_mode" not in session_columns:
            batch.add_column(sa.Column("explanation_mode", sa.String(), nullable=False, server_default="average"))
        if "duration_minutes" not in session_columns:
            batch.add_column(sa.Column("duration_minutes", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_study_sessions_document_id", "study_documents", ["document_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_study_sessions_document_id", "study_sessions", type_="foreignkey")
    op.drop_column("study_sessions", "duration_minutes")
    op.drop_column("study_sessions", "explanation_mode")
    op.drop_column("study_sessions", "subtopic")
    op.drop_column("study_sessions", "document_id")
    op.drop_column("study_documents", "extracted_text")
    op.drop_column("study_documents", "structure")