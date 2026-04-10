"""
Semantic Service
路径: backend/app/core/semantic_service.py

语义识别服务，专门负责将非结构化、杂乱的文本内容通过 LLM 解析为结构化的活动数据。
核心能力：
1. 活动提取：从长文本中识别并拆分出多个独立的活动项。
2. 字段映射：自动识别标题、日期、地点、价格和简介等核心字段。
3. 批量化支持：为前端批量内容输入节点提供底层语义支撑。
"""

import os
from typing import List, Dict
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from app.core import prompts, llm_config

class ContentItem(BaseModel):
    title: str = Field(description="活动标题")
    subtitle: str = Field(description="副标题或地点")
    date: str = Field(description="活动日期，如 05.20")
    year: str = Field(description="年份，如 2025")
    price: str = Field(description="价格信息")
    description: str = Field(description="详细描述或简介")

class SemanticResult(BaseModel):
    items: List[ContentItem] = Field(description="解析出的内容列表")

async def extract_semantic_content(text: str) -> List[Dict]:
    """利用 LLM 提取结构化文案"""
    base_url, api_key = await llm_config.get_llm_config()
    
    if not api_key:
        print("[Semantic Service] ❌ Missing API_KEY")
        return []

    llm = ChatOpenAI(
        model="gpt-4o-mini", # 使用响应速度快的模型
        openai_api_key=api_key,
        base_url=base_url,
        temperature=0
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", prompts.CONTENT_EXTRACTOR["main"]),
        ("user", "{text}")
    ])

    chain = prompt | llm.with_structured_output(SemanticResult)
    
    try:
        print(f"[Semantic Service] 🧠 Analyzing text (length: {len(text)})")
        result = await chain.ainvoke({"text": text})
        return [item.model_dump() for item in result.items]
    except Exception as e:
        print(f"[Semantic Service] ❌ Extraction failed: {e}")
        return []
