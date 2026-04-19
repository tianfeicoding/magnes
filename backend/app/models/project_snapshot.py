"""
Project Snapshot model for version control
支持为项目创建命名快照（里程碑/版本）
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey, Index
from app.core.database import Base


class ProjectSnapshot(Base):
    __tablename__ = "project_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # 快照数据
    nodes = Column(JSON, nullable=False)
    edges = Column(JSON, nullable=False)
    viewport = Column(JSON, nullable=False, default=dict)

    # 快照元数据
    name = Column(String, nullable=True)  # 用户可命名的里程碑，如 "v1.0 发布版"
    note = Column(String, nullable=True)  # 备注

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_snapshots_project_created", "project_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "projectId": self.project_id,
            "name": self.name,
            "note": self.note,
            "nodes": self.nodes,
            "edges": self.edges,
            "viewport": self.viewport,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
