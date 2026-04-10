"""
NoteDocument - 小红书收藏笔记的数据模型
来源：xhs-extractor 爬取的小红书收藏内容（图片+文案）
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class NoteDocument(BaseModel):
    """小红书收藏笔记文档"""
    id: str                                              # 笔记唯一ID（从URL提取）
    source_type: str = "xhs_covers"                     # 数据来源标识
    url: str                                             # 原始小红书链接
    xsec_token: Optional[str] = None                     # 访问令牌 (新)
    title: str = ""                                      # 笔记标题
    ocr_text: str = ""                                   # 封面OCR文字
    image_url: str = ""                                  # 封面图片URL
    visual_description: str = ""                         # Gemini Vision 视觉描述
    content: str = ""                                    # 笔记正文内容 (新)
    all_images: List[str] = Field(default_factory=list) # 所有图片URL列表 (新)
    style_tags: List[str] = Field(default_factory=list) # 风格标签 (新)
    likes: int = 0                                       # 点赞数 (新)
    collected_count: int = 0                             # 收藏数 (新)
    comment_count: int = 0                               # 评论数 (新)
    content_type: str = "note"                          # 内容类型: note / video (新)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    raw_data: Optional[dict] = None                      # 原始爬取数据（调试用）

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
