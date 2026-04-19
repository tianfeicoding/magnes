"""
Migration: Add Project and ProjectSnapshot tables
用于画布持久化的项目表和快照表
"""
from alembic import op
import sqlalchemy as sa


def upgrade():
    # 创建 projects 表
    op.create_table(
        'projects',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('nodes', sa.JSON(), nullable=False),
        sa.Column('edges', sa.JSON(), nullable=False),
        sa.Column('viewport', sa.JSON(), nullable=False),
        sa.Column('settings', sa.JSON(), nullable=False),
        sa.Column('conversation_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_deleted', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_projects_user_id', 'projects', ['user_id'])
    op.create_index('ix_projects_user_updated', 'projects', ['user_id', 'updated_at'])

    # 创建 project_snapshots 表
    op.create_table(
        'project_snapshots',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('nodes', sa.JSON(), nullable=False),
        sa.Column('edges', sa.JSON(), nullable=False),
        sa.Column('viewport', sa.JSON(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_project_snapshots_project_id', 'project_snapshots', ['project_id'])
    op.create_index('ix_snapshots_project_created', 'project_snapshots', ['project_id', 'created_at'])


def downgrade():
    op.drop_index('ix_snapshots_project_created', table_name='project_snapshots')
    op.drop_index('ix_project_snapshots_project_id', table_name='project_snapshots')
    op.drop_table('project_snapshots')
    op.drop_index('ix_projects_user_updated', table_name='projects')
    op.drop_index('ix_projects_user_id', table_name='projects')
    op.drop_table('projects')
