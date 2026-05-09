"""
knowledge_document.py - 通用知识库数据模型
支持品牌资料、Brief、运营SOP等长文档的元数据与分块存储
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class KnowledgeDocument(BaseModel):
    """通用知识库文档元数据（文件级）"""
    id: str                                              # 文件级 ID (内容 hash)
    source_type: str = "knowledge_base"                 # 数据来源标识
    filename: str                                        # 原始文件名
    file_type: str                                       # pdf / docx / xlsx
    file_size: int = 0                                   # 文件大小（字节）
    total_chunks: int = 0                                # 分块总数
    total_pages: int = 0                                 # 页数
    category: str = "通用资料"                               # 分类：品牌指南/运营SOP/Brief/通用资料
    tags: List[str] = Field(default_factory=list)        # 用户自定义标签
    image_count: int = 0                                 # 内嵌图片数
    upload_time: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class KnowledgeChunk(BaseModel):
    """知识库分块（存入 ChromaDB 的最小单元）"""
    chunk_id: str                                        # "{doc_id}_chunk_{seq}"
    doc_id: str                                          # 所属文档 ID
    parent_chunk_id: Optional[str] = None                # 父块 ID (Child 块才有)
    chunk_type: str = "child"                            # parent / child / table / image_parent / image_child
    content: str                                         # 分块文本内容
    page_num: int = 0                                    # 所在页码
    heading_path: str = ""                               # 标题路径 "品牌指南 > 色彩规范"
    seq: int = 0                                         # 在文档中的顺序号
    source_type: str = "knowledge_base"                 # 数据来源标识
    filename: str = ""                                   # 所属文件名
    category: str = "通用资料"                               # 继承文档分类
    global_summary: str = ""                             # 全局摘要，增强检索上下文
    global_tags: List[str] = Field(default_factory=list)  # 全局关键词
    image_path: Optional[str] = None                     # 图片分块对应的本地存储路径
