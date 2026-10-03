"""add_focus_metrics

Revision ID: 068947b78362
Revises: 353bb984d035
Create Date: 2026-10-03 10:02:43.624832

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '068947b78362'
down_revision = '353bb984d035'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'focus_metrics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('face_present', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('face_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ear', sa.Float(), nullable=True),
        sa.Column('eyes_closed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('drowsy', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('gaze', sa.String(), nullable=True),
        sa.Column('head_pose_status', sa.String(), nullable=True),
        sa.Column('yaw', sa.Float(), nullable=True),
        sa.Column('pitch', sa.Float(), nullable=True),
        sa.Column('roll', sa.Float(), nullable=True),
        sa.Column('blink_rate', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('look_away_duration', sa.Float(), nullable=True),
        sa.Column('focus_score', sa.Float(), nullable=False),
        sa.Column('productivity_score', sa.Float(), nullable=False),
        sa.Column('is_focused', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['study_sessions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_focus_metrics_session_id'), 'focus_metrics', ['session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_focus_metrics_session_id'), table_name='focus_metrics')
    op.drop_table('focus_metrics')
