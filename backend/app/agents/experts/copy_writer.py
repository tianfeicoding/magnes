"""
Copy Writing Agent
负责生成符合小红书调性的图文文案，支持固定格式输出。
"""
import os
from typing import Optional, List
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.core import llm_config

COPY_WRITER_PROMPT = """你是一个专业的小红书文案专家。
你的任务是根据用户提供的活动/灵感信息和品牌 Brief，生成一段极具吸引力的小红书文案。

文案必须严格遵循以下【图文格式】：
[标题] 
[时间] 
[地点] 
[门票/费用] 
[口号/一句话总结]

示例：
蟠龙水集
4.4-4.6
蟠龙天地
免费
乘花船、走花街、游花坞、来赶集

要求：
1. 语言简练，必须使用**垂直排版**的列表形式。
2. 重点突出，信息准确。
3. 即使背景信息较多，也必须提炼出上述 5 行核心信息，禁止堆叠在同一行。每行请以【标签】开头或加粗显示。
4. 每个市集/项目之间保留双换行符隔开。
"""

async def generate_copy_writing(content: str, brand_brief: str = "") -> str:
    """结合内容与品牌 Brief 生成文案"""
    from app.rag import config
    base_url, api_key = await llm_config.get_llm_config()
    model_name = config.DEFAULT_COPYWRITER_MODEL
    
    # --- 诊断日志 ---
    print(f"[CopyWriter] 使用模型: {model_name}", flush=True)

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.7
    )
    
    user_input = f"【活动内容/灵感】: {content}\n\n【品牌 Brief】: {brand_brief or '暂无'}\n\n请生成文案："
    
    response = await llm.ainvoke([
        SystemMessage(content=COPY_WRITER_PROMPT),
        HumanMessage(content=user_input)
    ])
    
    return str(response.content)
