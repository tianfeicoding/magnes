from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.models.user import User
from app.core.users import current_user
from app.memory import service
from app.memory.schemas import (
    MemoryCreateRequest, MemoryUpdateRequest, SoulMdRequest, MemoryMdRequest
)

router = APIRouter(prefix="/memory", tags=["memory"])


# ── Layer 1: 策展式长期记忆 CRUD ──

@router.get("/preferences")
async def get_user_memories(
    memory_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取当前用户的策展记忆列表"""
    items = await service.list_memories(db, user.id, memory_type)
    return {"status": "success", "data": [i.to_dict() for i in items]}


@router.post("/preferences")
async def create_user_memory(
    req: MemoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """手动创建或更新一条用户记忆"""
    item = await service.upsert_memory(db, user.id, req)
    await db.commit()
    return {"status": "success", "data": item.to_dict()}


@router.patch("/preferences/{memory_id}")
async def update_user_memory(
    memory_id: str,
    req: MemoryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """更新记忆内容或置信度"""
    item = await service.update_memory(db, user.id, memory_id, req)
    if not item:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()
    return {"status": "success", "data": item.to_dict()}


@router.delete("/preferences/{memory_id}")
async def delete_user_memory(
    memory_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """删除单条记忆"""
    ok = await service.delete_memory(db, user.id, memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.commit()
    return {"status": "success"}


# ── Soul.md ──

@router.get("/soul")
async def get_user_soul_md(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取当前用户的 Soul.md"""
    item = await service.get_soul_md(db, user.id)
    return {
        "status": "success",
        "data": {
            "id": item.id if item else None,
            "text": item.content.get("text", "") if item else "",
            "updatedAt": item.updated_at.isoformat() if item and item.updated_at else None
        }
    }


@router.post("/soul")
async def save_user_soul_md(
    req: SoulMdRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """保存/更新 Soul.md"""
    item = await service.upsert_soul_md(db, user.id, req.text)
    await db.commit()
    return {"status": "success", "data": item.to_dict()}


# ── MEMORY.md ──

@router.get("/memory")
async def get_user_memory_md(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取当前用户的 MEMORY.md"""
    item = await service.get_memory_md(db, user.id)
    return {
        "status": "success",
        "data": {
            "id": item.id if item else None,
            "text": item.content.get("text", "") if item else "",
            "updatedAt": item.updated_at.isoformat() if item and item.updated_at else None
        }
    }


@router.post("/memory")
async def save_user_memory_md(
    req: MemoryMdRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """保存/更新 MEMORY.md"""
    item = await service.upsert_memory_md(db, user.id, req.text)
    await db.commit()
    return {"status": "success", "data": item.to_dict()}


# ── 记忆摘要（用于对话注入）──

@router.get("/summary")
async def get_memory_summary_for_prompt(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    获取当前用户记忆的 system-prompt 就绪摘要。
    dialogue_routes 在调用 run_planner 前请求此接口。
    """
    summary = await service.build_memory_summary_for_injection(db, user.id)
    return {"status": "success", "summary": summary}
