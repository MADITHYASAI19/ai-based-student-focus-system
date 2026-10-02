"""extend quiz_attempts with rich fields

Revision ID: a1b2c3d4e5f6
Revises: 5f90cb866138
Create Date: 2026-09-30 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "5f90cb866138"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add rich quiz fields to quiz_attempts table."""
    with op.batch_alter_table("quiz_attempts") as batch_op:
        batch_op.add_column(sa.Column("topic_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("difficulty", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("question_type", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("question_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("total_points", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("percentage", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("correct_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("incorrect_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("unanswered_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("start_time", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("time_limit_minutes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("question_results", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove the rich quiz fields from quiz_attempts."""
    with op.batch_alter_table("quiz_attempts") as batch_op:
        batch_op.drop_column("question_results")
        batch_op.drop_column("time_limit_minutes")
        batch_op.drop_column("start_time")
        batch_op.drop_column("unanswered_count")
        batch_op.drop_column("incorrect_count")
        batch_op.drop_column("correct_count")
        batch_op.drop_column("percentage")
        batch_op.drop_column("total_points")
        batch_op.drop_column("question_count")
        batch_op.drop_column("question_type")
        batch_op.drop_column("difficulty")
        batch_op.drop_column("topic_id")
