"""
Project model for canvas persistence
负责保存/恢复 ReactFlow 画布状态（nodes、edges、viewport）
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, JSON, DateTime, Index, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # 项目元数据
    name = Column(String, nullable=False, default="未命名项目")
    description = Column(String, nullable=True)

    # 画布状态（核心数据）
    nodes = Column(JSON, nullable=False, default=list)
    edges = Column(JSON, nullable=False, default=list)
    viewport = Column(JSON, nullable=False, default=dict)  # { x, y, zoom }

    # 项目级配置
    settings = Column(JSON, nullable=False, default=dict)
    # 例如: { "itemsPerPage": 3, "theme": "light", "lastNodeId": "..." }

    # 当前激活的会话（用于恢复对话上下文）
    conversation_id = Column(String, nullable=True)

    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 软删除
    is_deleted = Column(String, default="0")  # "0" = 正常, "1" = 已删除

    # 复合索引
    __table_args__ = (
        Index("ix_projects_user_updated", "user_id", "updated_at"),
    )

    owner = relationship("User", back_populates="projects")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "nodes": self.nodes,
            "edges": self.edges,
            "viewport": self.viewport,
            "settings": self.settings,
            "conversationId": self.conversation_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }

    def _extract_thumbnail_from_nodes(self):
        """从 nodes 数据中自动提取第一张图片 URL 作为缩略图"""
        if not self.nodes:
            return None

        # 所有可能包含图片 URL 的字段名
        IMAGE_KEYS = {"url", "imageUrl", "image_url", "src", "thumbnail",
                      "previewUrl", "outputUrl", "output_url", "resultImage",
                      "result_image", "background", "bgUrl", "bg_url", "image"}

        def _looks_like_image_url(val):
            if not val or not isinstance(val, str):
                return False
            if val.startswith("data:image") or val.startswith("http") or val.startswith("/"):
                return True
            return False

        def _search_image(obj):
            """递归搜索对象中的图片 URL"""
            if isinstance(obj, dict):
                # 优先匹配已知的图片字段名
                for key in IMAGE_KEYS:
                    val = obj.get(key)
                    if _looks_like_image_url(val):
                        return val
                # 递归搜索子对象（跳过纯文本字段）
                for val in obj.values():
                    result = _search_image(val)
                    if result:
                        return result
            elif isinstance(obj, list):
                for item in obj:
                    result = _search_image(item)
                    if result:
                        return result
            return None

        for node in self.nodes:
            if not isinstance(node, dict):
                continue
            # 优先搜索 node.data（ReactFlow 节点标准结构）
            data = node.get("data")
            if isinstance(data, dict):
                result = _search_image(data)
                if result:
                    return result
            # fallback：搜索整个 node
            result = _search_image(node)
            if result:
                return result
        return None

    def to_summary_dict(self):
        """列表视图使用的精简版"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "nodeCount": len(self.nodes) if self.nodes else 0,
            "edgeCount": len(self.edges) if self.edges else 0,
            "thumbnailUrl": self._extract_thumbnail_from_nodes(),
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
