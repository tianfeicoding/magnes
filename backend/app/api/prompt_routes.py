"""
Prompt API Routes
用于前端拉取后端定义的标准 Prompt 模板。
保证前后端 AI 逻辑的一致性。
"""
from fastapi import APIRouter
from app.core.prompts import get_all_prompts

router = APIRouter(
    prefix="/prompts",
    tags=["prompts"]
)

@router.get("/")
async def list_prompts():
    """获取所有全局 Prompt 模板"""
    return get_all_prompts()
