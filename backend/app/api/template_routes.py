"""
Template API Routes
负责管理设计模版（Template）的 CRUD 接口。
允许用户保存编辑后的海报布局、原子资产配置及元数据。
作为 Magnes 平台设计资产持久化的核心入口。
"""
# backend/app/api/template_routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.models import Template
from app.core.storage_utils import download_and_persist_image

# 创建路由对象，通常会给一个前缀 (prefix) 和 标签 (tags)
router = APIRouter(
    prefix="/templates",
    tags=["templates"]
)

@router.get("/")
async def list_templates(db: AsyncSession = Depends(get_db)):
    """获取所有收藏模版"""
    result = await db.execute(select(Template).order_by(Template.created_at.desc()))
    templates = result.scalars().all()
    return [t.to_dict() for t in templates]

async def process_layout_images(layout: list) -> list:
    """遍历布局，将所有外链图片持久化"""
    if not layout or not isinstance(layout, list):
        return layout
    
    new_layout = []
    for layer in layout:
        # 深度拷贝一下，避免修改原始引用（虽然此处是 dict）
        new_layer = layer.copy()
        
        # 扫描含有 url 的图层 (image, placeholder_image, background 等)
        url = new_layer.get("url")
        if url and isinstance(url, str) and url.startswith("http"):
            print(f"[Template Save] 🚩 Found external URL in layer: {url}")
            local_url = await download_and_persist_image(url)
            if local_url:
                new_layer["url"] = local_url
                # 兼容性：某些旧逻辑可能同时使用了 content 存储 URL
                if new_layer.get("type") in ["image", "placeholder_image"] and new_layer.get("content") == url:
                    new_layer["content"] = local_url
                
        new_layout.append(new_layer)
    return new_layout

@router.post("/")
async def save_template(data: dict, db: AsyncSession = Depends(get_db)):
    """保存或更新模版"""
    template_id = data.get("id")
    if not template_id:
        raise HTTPException(status_code=400, detail="Missing template ID")

    # [持久化处理] 扫描并转存 layout 中的外链图片
    layout_data = data.get("layout")
    if layout_data:
        layout_data = await process_layout_images(layout_data)

    # 检查是否存在
    existing = await db.get(Template, template_id)
    if existing:
        # 更新逻辑
        existing.name = data.get("name", existing.name)
        existing.layout = layout_data
        existing.atoms = data.get("atoms")
        existing.metadata_info = data.get("metadata")
    else:
        # 新增逻辑
        new_template = Template(
            id=template_id,
            name=data.get("name"),
            type=data.get("type", "custom"),
            layout=layout_data,
            atoms=data.get("atoms"),
            metadata_info=data.get("metadata")
        )
        db.add(new_template)
    
    await db.commit()
    return {"status": "success", "id": template_id}

@router.delete("/{template_id}")
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    """彻底删除模版"""
    template = await db.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    await db.delete(template)
    await db.commit()
    return {"status": "success"}
