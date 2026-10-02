"""add_face_tracking_events

Revision ID: 353bb984d035
Revises: a5825f5d2af5
Create Date: 2026-10-01 07:49:53.679307

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '353bb984d035'
down_revision = 'a5825f5d2af5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'face_tracking_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_attempt_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('event_metadata', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['quiz_attempt_id'], ['quiz_attempts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_face_tracking_events_quiz_attempt_id'), 'face_tracking_events', ['quiz_attempt_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_face_tracking_events_quiz_attempt_id'), table_name='face_tracking_events')
    op.drop_table('face_tracking_events')
