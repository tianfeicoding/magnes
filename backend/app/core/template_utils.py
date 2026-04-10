# backend/app/core/template_utils.py
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models import Template

async def get_available_template_names() -> str:
    """获取所有可用模版的名称列表，用于提示词注入"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Template.name).order_by(Template.created_at.desc()))
            names = result.scalars().all()
            if names:
                # 返回格式如: 粉色活动模版, 黑色简约, 潮流市集
                return ", ".join(names)
            return "粉色活动模版, 黑色简约, 活动" # 兜底
    except Exception as e:
        print(f"[TemplateUtils] 获取模版列表失败: {e}")
        return "粉色活动模版, 黑色简约, 活动"

async def get_available_templates_metadata() -> list:
    """获取所有可用模版的元数据列表 (ID, Name)，用于前端渲染按钮"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Template.id, Template.name).order_by(Template.created_at.desc()))
            rows = result.all()
            if rows:
                return [{"id": row[0], "name": row[1]} for row in rows]
            # 兜底默认模版
            return [
                {"id": "trendy_market", "name": "潮流市集"},
                {"id": "pink_activity", "name": "粉色活动"},
                {"id": "black_minimalist", "name": "黑色简约"}
            ]
    except Exception as e:
        print(f"[TemplateUtils] 获取模版元数据失败: {e}")
        return []
