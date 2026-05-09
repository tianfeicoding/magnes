"""
Painter Routes - AI 图像生成
提供背景生成、图生图等接口
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from typing import Optional
import time

from app.tools.painting_tool import call_image_generate
from app.core.users import current_user
from app.models.user import User
from app.rag.ingestion.gallery_extractor import extract_from_gallery
from app.rag.vectorstore.chroma_store import upsert_document
from app.rag.retrieval.bm25_retriever import get_bm25_index

router = APIRouter(prefix="/painter", tags=["Painter AI 绘图"])


class GenerateBackgroundRequest(BaseModel):
    prompt: str = Field(..., description="生成提示词")
    aspect_ratio: str = Field("3:4", description="宽高比 (3:4, 4:3, 1:1, 16:9)")
    reference_image: Optional[str] = Field(None, description="参考图URL (可选)")
    reference_mode: str = Field("txt2img", description="生成模式: txt2img(文生图) 或 img2img(图生图)")


class GenerateBackgroundResponse(BaseModel):
    url: str = Field(..., description="生成的图片URL")
    mode: str = Field(..., description="使用的生成模式")


@router.post("/generate/background", response_model=GenerateBackgroundResponse)
async def generate_background(
    request: GenerateBackgroundRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user)
):
    """
    生成背景图，支持纯文本生成或基于参考图优化
    """
    try:
        # 根据 aspect_ratio 计算 size
        size_map = {
            "1:1": "1024x1024",
            "3:4": "1024x1365",  # 竖版
            "4:3": "1365x1024",  # 横版
            "16:9": "1920x1080",
            "9:16": "1080x1920"
        }
        size = size_map.get(request.aspect_ratio, "1024x1365")

        # 判断是否使用参考图
        image_url = None
        if request.reference_mode == "img2img" and request.reference_image:
            image_url = request.reference_image
            print(f"[Painter] 使用参考图模式: {image_url[:50]}...")

        # 调用生图工具
        result_url = await call_image_generate(
            prompt=request.prompt,
            size=size,
            model="nano-banana",  # 切换为 nano-banana 模型
            image_url=image_url
        )

        if not result_url:
            raise HTTPException(status_code=500, detail="图像生成失败")

        # 自动入库 AI 生图库 (RAG)
        version_data = {
            "id": f"bg_{int(time.time() * 1000)}",
            "url": result_url,
            "prompt": request.prompt,
            "skill_name": "background-gen",
            "rating": "good",
            "timestamp": int(time.time() * 1000),
            "params": {
                "aspect_ratio": request.aspect_ratio,
                "reference_mode": request.reference_mode
            }
        }
        background_tasks.add_task(_ingest_background_to_rag, version_data, user)

        return GenerateBackgroundResponse(
            url=result_url,
            mode="img2img" if image_url else "txt2img"
        )
    except Exception as e:
        print(f"[Painter] 生成背景失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


async def _ingest_background_to_rag(version_data: dict, user: User):
    """
    后台任务：将生成的背景图转换并存入 RAG 向量库
    """
    try:
        print(f"[Painter Ingest] 🚀 开始自动入库: {version_data['id']}")
        doc = await extract_from_gallery(version_data)
        await upsert_document(doc, user_id=user.id)
        
        # 标记 BM25 需要重建
        get_bm25_index().mark_dirty()
        print(f"[Painter Ingest] ✅ 自动入库成功: {doc.id}")
    except Exception as e:
        print(f"[Painter Ingest] ❌ 自动入库失败: {e}")
