"""
History API Routes
负责管理生成历史（Generation History）的 CRUD 接口。
支持历史记录的查询、保存、更新以及清空，直接与数据库中的 generation_history 表交互。
"""
# backend/app/api/history_routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.models import GenerationHistory

router = APIRouter(
    prefix="/history",
    tags=["history"]
)

@router.get("/")
async def list_history(db: AsyncSession = Depends(get_db)):
    """获取所有生成历史"""
    result = await db.execute(
        select(GenerationHistory).order_by(GenerationHistory.created_at.desc())
    )
    history = result.scalars().all()
    return [h.to_dict() for h in history]

@router.post("/")
async def save_history_item(data: dict, db: AsyncSession = Depends(get_db)):
    """保存或更新单条历史记录"""
    item_id = data.get("id")
    if not item_id:
        raise HTTPException(status_code=400, detail="Missing history item ID")

    # 检查是否存在
    existing = await db.get(GenerationHistory, item_id)
    if existing:
        # 更新逻辑
        for key in ["status", "url", "content", "progress", "errorMsg", "metadata"]:
            if key in data:
                # 数据库字段名与前端 key 转换
                db_key = "model_name" if key == "modelName" else ("metadata_info" if key == "metadata" else ("error_msg" if key == "errorMsg" else key))
                setattr(existing, db_key, data[key])
    else:
        # 新增逻辑
        new_item = GenerationHistory(
            id=item_id,
            type=data.get("type", "image"),
            status=data.get("status", "generating"),
            prompt=data.get("prompt"),
            model_name=data.get("modelName"),
            url=data.get("url"),
            content=data.get("content"),
            progress=data.get("progress", 0),
            source_node_id=data.get("sourceNodeId"),
            error_msg=data.get("errorMsg"),
            metadata_info=data.get("metadata")
        )
        db.add(new_item)
    
    await db.commit()
    return {"status": "success", "id": item_id}

@router.delete("/{item_id}")
async def delete_history_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """删除单条历史记录"""
    item = await db.get(GenerationHistory, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="History item not found")
    
    await db.delete(item)
    await db.commit()
    return {"status": "success"}

@router.delete("/clear/all")
async def clear_all_history(db: AsyncSession = Depends(get_db)):
    """清空所有历史记录 (慎用)"""
    await db.execute(delete(GenerationHistory))
    await db.commit()
    return {"status": "success"}
