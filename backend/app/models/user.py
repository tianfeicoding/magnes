"""
User model for FastAPI-Users integration
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    """User model for authentication and API key storage"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    templates = relationship("Template", back_populates="owner")
    histories = relationship("GenerationHistory", back_populates="owner")
    memories = relationship("UserMemory", back_populates="owner", cascade="all, delete-orphan")
    conversation_summaries = relationship("ConversationSummary", cascade="all, delete-orphan")
    canvas_action_logs = relationship("CanvasActionLog", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    project_snapshots = relationship("ProjectSnapshot", cascade="all, delete-orphan")
