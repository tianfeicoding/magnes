from pydantic import BaseModel, Field
from typing import Optional, Literal, Any
from datetime import datetime


class MemoryCreateRequest(BaseModel):
    memoryType: Literal["preference", "soul", "memory", "template", "style", "rejection", "workflow", "custom"]
    key: str
    content: dict
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    evidence: Optional[str] = None
    sourceConversationId: Optional[str] = None


class MemoryUpdateRequest(BaseModel):
    content: Optional[dict] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    evidence: Optional[str] = None


class MemoryItemResponse(BaseModel):
    id: str
    memoryType: str
    key: str
    content: dict
    confidence: float
    evidence: Optional[str]
    createdAt: Optional[datetime]
    updatedAt: Optional[datetime]


class SoulMdRequest(BaseModel):
    text: str


class SoulMdResponse(BaseModel):
    id: Optional[str]
    text: str
    updatedAt: Optional[datetime]


class MemoryMdRequest(BaseModel):
    text: str


class MemoryMdResponse(BaseModel):
    id: Optional[str]
    text: str
    updatedAt: Optional[datetime]


class MemorySearchRequest(BaseModel):
    query: str
    topK: int = Field(default=5, ge=1, le=50)
    filters: Optional[dict] = None


class CompactRequest(BaseModel):
    conversationId: str
    preserveLastN: int = Field(default=6, ge=2, le=20)
    summaryModel: str = "claude-sonnet-4-6"
