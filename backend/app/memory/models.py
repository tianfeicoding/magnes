# backend/app/memory/models.py
import uuid
from datetime import datetime
from sqlalchemy import Column, String, JSON, DateTime, Float, Index, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserMemory(Base):
    __tablename__ = "user_memories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # 记忆类型: preference | soul | template | style | rejection | workflow | custom
    memory_type = Column(String, nullable=False, index=True)

    # 人类可读的记忆标题/键名
    key = Column(String, nullable=False)

    # 记忆内容，结构化存储
    content = Column(JSON, nullable=False)

    # 可信度/强度 (0.0 ~ 1.0)，用于后续排序和淘汰
    confidence = Column(Float, default=0.5)

    # 证据摘要 (如 "用户连续3次选择粉色活动模版")
    evidence = Column(String)

    # 来源会话 ID，用于追溯
    source_conversation_id = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 复合索引：快速查询某用户的某类记忆
    __table_args__ = (
        Index("ix_user_memories_user_type", "user_id", "memory_type"),
    )

    owner = relationship("User", back_populates="memories")

    def to_dict(self):
        return {
            "id": self.id,
            "memoryType": self.memory_type,
            "key": self.key,
            "content": self.content,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "sourceConversationId": self.source_conversation_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(String, nullable=False, index=True)

    # 被摘要覆盖的消息范围 (0 ~ N)
    message_start_index = Column(Integer, default=0)
    message_end_index = Column(Integer, nullable=False)

    # LLM 生成的结构化摘要
    summary_text = Column(String, nullable=False)

    # 提取的关键任务状态、决策、TODO、节点引用
    structured_summary = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_conv_summaries_conv", "conversation_id", "message_end_index"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "messageStartIndex": self.message_start_index,
            "messageEndIndex": self.message_end_index,
            "summaryText": self.summary_text,
            "structuredSummary": self.structured_summary,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class CanvasActionLog(Base):
    __tablename__ = "canvas_action_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(String, nullable=True, index=True)

    # 动作类型: node_create | node_delete | node_update | edge_connect | asset_replace | text_edit | publish
    action_type = Column(String, nullable=False, index=True)

    # 目标节点 ID
    target_node_id = Column(String, nullable=True, index=True)

    # 动作详情 JSON
    payload = Column(JSON, nullable=False)

    # 用于语义检索的文本快照
    description = Column(String, nullable=False, default="")

    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "actionType": self.action_type,
            "targetNodeId": self.target_node_id,
            "payload": self.payload,
            "description": self.description,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
