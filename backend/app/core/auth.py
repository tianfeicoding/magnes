import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import UserConfig

async def get_config_value(db: AsyncSession, key: str) -> Optional[str]:
    """从数据库获取用户配置值"""
    query = select(UserConfig).where(UserConfig.key == key)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    return config.value if config else None

async def set_config_value(db: AsyncSession, key: str, value: str):
    """保存用户配置值到数据库"""
    query = select(UserConfig).where(UserConfig.key == key)
    result = await db.execute(query)
    config = result.scalar_one_or_none()
    
    if config:
        config.value = value
    else:
        config = UserConfig(key=key, value=value)
        db.add(config)
    
    await db.commit()

async def get_global_api_key(db: AsyncSession) -> Optional[str]:
    """获取全局 API Key"""
    return await get_config_value(db, "global_api_key")
