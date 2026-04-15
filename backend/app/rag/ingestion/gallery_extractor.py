"""
gallery_extractor.py - Version Gallery 历史版本提取器
从 Version Gallery 节点数据中提取特征，存入 RAG 向量库
触发时机：
  1. 用户在 Version Gallery 点击「收藏到知识库」时，立即触发
  2. 系统启动时，可批量扫描所有 rating="good" 版本
"""
from datetime import datetime
from typing import Optional

from app.rag.models.gallery_document import GalleryDocument
from app.rag.ingestion.vision_describer import describe_image_with_vision


async def extract_from_gallery(version_data: dict) -> GalleryDocument:
    """
    从 Version Gallery 版本数据中提取特征，生成 GalleryDocument
    
    Args:
        version_data: Version Gallery 节点的单条版本数据
        {
            "version_id": "v_1234567890",
            "image_url": "https://...",
            "rating": "good",           # "good" | "bad" | "unrated"
            "skill_name": "手绘地图",    # 使用的 Skill
            "params": {                  # 生成参数快照
                "style": "warm",
                "layout": "center"
            },
            "timestamp": 1234567890000,
            "label": "V1"
        }
    
    Returns:
        GalleryDocument（含 Gemini Vision 生成的 visual_description）
    """
    version_id = version_data.get("version_id") or version_data.get("id", f"gallery_{datetime.utcnow().timestamp()}")
    image_url = version_data.get("image_url") or version_data.get("url", "")
    rating = version_data.get("rating", "unrated")
    skill_name = version_data.get("skill_name") or version_data.get("skill", "")
    generation_params = version_data.get("params") or version_data.get("generation_params", {})
    
    # 提取新字段
    user_tags = version_data.get("user_tags", [])
    group_id = version_data.get("group_id") or version_data.get("node_id", "")
    prompt = version_data.get("prompt", "")
    prompt_source = version_data.get("prompt_source", "")
    prompt_id = version_data.get("prompt_id")
    folder_name = version_data.get("folder_name") or ""
    
    # 获取时间戳并生成默认文件夹名 (YYYYMMDD)
    ts = version_data.get("timestamp")
    if ts:
        created_at = datetime.fromtimestamp(ts / 1000) if ts > 1e10 else datetime.fromtimestamp(ts)
    else:
        created_at = datetime.utcnow()
    
    if not folder_name:
        folder_name = created_at.strftime("%Y%m%d") # 默认按日期命名

    # 使用 Gemini Vision 生成视觉描述
    visual_description = ""
    style_tags = []
    
    if image_url:
        try:
            context_hint = f"这是使用「{skill_name}」技能生成的小红书封面" if skill_name else "这是AI生成的小红书封面"
            vision_result = await describe_image_with_vision(image_url, context_hint)
            visual_description = vision_result.get("description", "")
            style_tags = vision_result.get("style_tags", [])
        except Exception as e:
            print(f"[Gallery Extractor] Vision 描述失败: {e}")
            visual_description = f"AI生成封面，技能：{skill_name}" if skill_name else "AI生成封面"
    
    # 下载图片到本地
    from app.rag.image_service import image_service
    local_image_url = await image_service.download_and_save(image_url, "gallery")

    return GalleryDocument(
        id=version_id,
        image_url=local_image_url or image_url,
        visual_description=visual_description,
        style_tags=style_tags,
        rating=rating,
        skill_name=skill_name,
        generation_params=generation_params,
        user_tags=user_tags,
        group_id=group_id,
        folder_name=folder_name,
        prompt=prompt,
        prompt_source=prompt_source,
        prompt_id=prompt_id,
        created_at=created_at
    )
