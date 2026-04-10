# backend/app/models.py
from sqlalchemy import Column, String, JSON, DateTime
from datetime import datetime
from app.core.database import Base

class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True, index=True) # 使用前端生成的 ID 或 UUID
    name = Column(String, nullable=False)
    type = Column(String, default="custom")
    layout = Column(JSON)      # 图层数据
    atoms = Column(JSON)       # 配色与元数据
    metadata_info = Column(JSON) # 避免使用 metadata 关键字（SQLAlchemy 基类已占用）
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "layout": self.layout,
            "atoms": self.atoms,
            "metadata": self.metadata_info,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class GenerationHistory(Base):
    __tablename__ = "generation_history"

    id = Column(String, primary_key=True, index=True)
    type = Column(String, default="image")
    status = Column(String, default="generating")
    prompt = Column(String)
    model_name = Column(String)
    url = Column(String)
    content = Column(String)
    progress = Column(JSON, default=0) # 支持存整数或带额外信息的进度
    source_node_id = Column(String)
    error_msg = Column(String)
    metadata_info = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "prompt": self.prompt,
            "modelName": self.model_name,
            "url": self.url,
            "content": self.content,
            "progress": self.progress,
            "sourceNodeId": self.source_node_id,
            "errorMsg": self.error_msg,
            "metadata": self.metadata_info,
            "startTime": self.created_at.timestamp() * 1000 if self.created_at else None
        }

class UserConfig(Base):
    __tablename__ = "user_configs"

    key = Column(String, primary_key=True)  # 配置项名称，如 "global_api_key"
    value = Column(String)                  # 配置值
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None
        }
