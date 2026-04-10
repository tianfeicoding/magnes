from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import set_config_value, get_config_value
from pydantic import BaseModel

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

class AuthConfig(BaseModel):
    value: str
    config_type: str # global_api_key, global_api_url, slicer_api_key, slicer_api_url

@router.post("/config")
async def set_auth_config(data: AuthConfig, db: AsyncSession = Depends(get_db)):
    """设置配置项到后端存储"""
    if not data.value:
        raise HTTPException(status_code=400, detail="Value is required")
    
    # 验证合法性
    allowed_keys = ["global_api_key", "global_api_url", "slicer_api_key", "slicer_api_url"]
    if data.config_type not in allowed_keys:
        raise HTTPException(status_code=400, detail="Invalid config type")

    await set_config_value(db, data.config_type, data.value)
    return {"status": "success", "message": f"{data.config_type} saved successfully"}

@router.get("/status")
async def get_auth_status(db: AsyncSession = Depends(get_db)):
    """检查各端配置状态 (不返回明文)"""
    def mask(key):
        return f"{key[:6]}...{key[-4:]}" if key and len(key) > 10 else ("***" if key else None)

    global_key = await get_config_value(db, "global_api_key")
    global_url = await get_config_value(db, "global_api_url")
    slicer_key = await get_config_value(db, "slicer_api_key")
    slicer_url = await get_config_value(db, "slicer_api_url")
    
    return {
        "status": "success",
        "configs": {
            "global_api_key": {"configured": bool(global_key), "preview": mask(global_key)},
            "global_api_url": {"configured": bool(global_url), "preview": global_url},
            "slicer_api_key": {"configured": bool(slicer_key), "preview": mask(slicer_key)},
            "slicer_api_url": {"configured": bool(slicer_url), "preview": slicer_url}
        }
    }
