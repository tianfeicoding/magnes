# backend/app/models/history.py
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class GenerationHistory(Base):
    __tablename__ = "generation_history"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    type = Column(String, default="image")
    status = Column(String, default="generating")
    prompt = Column(String)
    model_name = Column(String)
    url = Column(String)
    content = Column(String)
    progress = Column(JSON, default=0)
    source_node_id = Column(String)
    error_msg = Column(String)
    metadata_info = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="histories")

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
