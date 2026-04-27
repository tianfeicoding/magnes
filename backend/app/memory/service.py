from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.memory.models import UserMemory
from app.memory.schemas import MemoryCreateRequest, MemoryUpdateRequest


async def list_memories(
    db: AsyncSession,
    user_id: str,
    memory_type: Optional[str] = None
) -> List[UserMemory]:
    """获取用户的记忆列表"""
    query = select(UserMemory).where(UserMemory.user_id == user_id)
    if memory_type:
        query = query.where(UserMemory.memory_type == memory_type)
    query = query.order_by(UserMemory.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def upsert_memory(
    db: AsyncSession,
    user_id: str,
    req: MemoryCreateRequest
) -> UserMemory:
    """创建或更新记忆（按 user_id + memory_type + key 联合唯一）"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == req.memoryType,
                UserMemory.key == req.key,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = req.content
        if req.confidence is not None:
            existing.confidence = req.confidence
        if req.evidence is not None:
            existing.evidence = req.evidence
        if req.sourceConversationId is not None:
            existing.source_conversation_id = req.sourceConversationId
        return existing
    else:
        new_item = UserMemory(
            user_id=user_id,
            memory_type=req.memoryType,
            key=req.key,
            content=req.content,
            confidence=req.confidence,
            evidence=req.evidence,
            source_conversation_id=req.sourceConversationId,
        )
        db.add(new_item)
        return new_item


async def update_memory(
    db: AsyncSession,
    user_id: str,
    memory_id: str,
    req: MemoryUpdateRequest
) -> Optional[UserMemory]:
    """按 ID 更新记忆"""
    result = await db.execute(
        select(UserMemory).where(
            and_(UserMemory.id == memory_id, UserMemory.user_id == user_id)
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        return None
    if req.content is not None:
        item.content = req.content
    if req.confidence is not None:
        item.confidence = req.confidence
    if req.evidence is not None:
        item.evidence = req.evidence
    return item


async def delete_memory(
    db: AsyncSession,
    user_id: str,
    memory_id: str
) -> bool:
    """按 ID 删除记忆"""
    result = await db.execute(
        select(UserMemory).where(
            and_(UserMemory.id == memory_id, UserMemory.user_id == user_id)
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        return False
    await db.delete(item)
    return True


async def get_soul_md(
    db: AsyncSession,
    user_id: str
) -> Optional[UserMemory]:
    """获取用户的 Soul.md"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == "soul",
                UserMemory.key == "soul_md",
            )
        )
    )
    return result.scalar_one_or_none()


async def upsert_soul_md(
    db: AsyncSession,
    user_id: str,
    text: str
) -> UserMemory:
    """创建或更新 Soul.md"""
    item = await get_soul_md(db, user_id)
    if item:
        item.content = {"text": text}
        item.evidence = text[:200] if text else ""
        item.confidence = 1.0
    else:
        item = UserMemory(
            user_id=user_id,
            memory_type="soul",
            key="soul_md",
            content={"text": text},
            confidence=1.0,
            evidence=text[:200] if text else "",
        )
        db.add(item)
    return item


async def get_memory_md(
    db: AsyncSession,
    user_id: str
) -> Optional[UserMemory]:
    """获取用户的 MEMORY.md"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == "memory",
                UserMemory.key == "memory_md",
            )
        )
    )
    return result.scalar_one_or_none()


async def upsert_memory_md(
    db: AsyncSession,
    user_id: str,
    text: str
) -> UserMemory:
    """创建或更新 MEMORY.md"""
    item = await get_memory_md(db, user_id)
    if item:
        item.content = {"text": text}
        item.evidence = text[:200] if text else ""
        item.confidence = 1.0
    else:
        item = UserMemory(
            user_id=user_id,
            memory_type="memory",
            key="memory_md",
            content={"text": text},
            confidence=1.0,
            evidence=text[:200] if text else "",
        )
        db.add(item)
    return item


async def build_memory_summary_for_injection(
    db: AsyncSession,
    user_id: str
) -> str:
    """组装成可直接拼接到 system prompt 的文本块"""
    parts = []

    # 1. Soul.md 最高优先级
    soul = await get_soul_md(db, user_id)
    if soul and soul.content.get("text"):
        parts.append(f"[用户设定 - Soul.md]\n{soul.content['text'].strip()}")

    # 2. MEMORY.md 次之
    memory_md = await get_memory_md(db, user_id)
    if memory_md and memory_md.content.get("text"):
        parts.append(f"[记忆索引 - MEMORY.md]\n{memory_md.content['text'].strip()}")

    # 3. preference 类型记忆
    prefs = await list_memories(db, user_id, memory_type="preference")
    strong_prefs = [p for p in prefs if p.confidence > 0.5]
    if strong_prefs:
        parts.append("[用户偏好]")
        for p in strong_prefs[:8]:
            val = p.content.get("label") or p.content.get("value") or str(p.content)
            parts.append(f"- {p.key}: {val}")

    # 4. rejection 类型记忆
    rejections = await list_memories(db, user_id, memory_type="rejection")
    if rejections:
        parts.append("[用户明确不喜欢]")
        for r in rejections[:5]:
            reason = r.content.get("reason") or r.content.get("subject") or str(r.content)
            parts.append(f"- {reason}")

    return "\n".join(parts)
