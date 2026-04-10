"""
GalleryDocument - Version Gallery 历史版本的数据模型
来源：Magnes Version Gallery 节点中用户生成并收藏的图片
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class GalleryDocument(BaseModel):
    """Version Gallery 历史版本文档"""
    id: str                                              # version_id，来自 Version Gallery
    source_type: str = "version_gallery"                 # 数据来源标识
    image_url: str                                       # Composer 输出的最终图片
    visual_description: str = ""                         # Gemini Vision 对生成结果的描述
    style_tags: List[str] = Field(default_factory=list) # 风格标签
    rating: str = "unrated"                             # "good" | "bad" | "unrated"
    skill_name: str = ""                                 # 使用的 Skill（如"手绘地图"）
    generation_params: dict = Field(default_factory=dict) # 生成时的参数快照
    
    # [NEW] 用户自定义标签与文件夹管理
    user_tags: List[str] = Field(default_factory=list)  # 用户手动打的标签
    group_id: str = ""                                  # 生成批次 ID (用于时间轴显示)
    folder_name: str = ""                               # 文件夹重命名支持
    
    # [NEW] 提示词追踪
    prompt: str = ""                                    # 生成该图的提示词原文
    prompt_source: str = ""                             # 来源: user_input / system_generated / skill_generated
    prompt_id: Optional[str] = None                    # 提示词链路迭代 ID

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
