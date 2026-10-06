"""add_topic_content

Revision ID: 20261005_1200_add_topic_content
Revises: 068947b78362
Create Date: 2026-10-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20261005_1200_add_topic_content'
down_revision = '068947b78362'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'topic_content',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('topic_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('explanation_mode', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('generated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['topic_id'], ['topics.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('topic_id', 'student_id', 'explanation_mode', name='uq_topic_content_topic_student_mode')
    )
    op.create_index(op.f('ix_topic_content_student_id'), 'topic_content', ['student_id'], unique=False)
    op.create_index(op.f('ix_topic_content_topic_id'), 'topic_content', ['topic_id'], unique=False)


def downgrade() -> None:
    op.drop_table('topic_content')
