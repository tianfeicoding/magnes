# backend/app/models/template.py
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, default="custom")
    layout = Column(JSON)
    atoms = Column(JSON)
    metadata_info = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="templates")

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
