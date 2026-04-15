# backend/app/models/config.py
from sqlalchemy import Column, String, DateTime
from datetime import datetime
from app.core.database import Base

class UserConfig(Base):
    __tablename__ = "user_configs"

    key = Column(String, primary_key=True)
    value = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None
        }
