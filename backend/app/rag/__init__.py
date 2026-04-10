# RAG 模块 - Magnes Style Memory System
from .config import (
    API_KEY, API_BASE_URL, 
    ONLINE_LLM_MODEL, ONLINE_EMBEDDING_MODEL,
    LLM_TEMPERATURE, LLM_SYSTEM_PROMPT,
    EMBED_BATCH_SIZE, CHUNK_SIZE, CHUNK_OVERLAP
)

def init_rag_settings():
    """
    初始化 LlamaIndex 全局配置
    放置在 __init__.py 中作为 RAG 模块的官方启动入口
    """
    from llama_index.core import Settings
    from llama_index.llms.openai import OpenAI
    from llama_index.embeddings.openai import OpenAIEmbedding

    # 1. 提取公共 API 参数
    api_cfg = {"api_key": API_KEY, "api_base": API_BASE_URL}

    # 2. 注入核心模型 (利用字典解包)
    Settings.llm = OpenAI(
        model=ONLINE_LLM_MODEL, 
        temperature=LLM_TEMPERATURE, 
        system_prompt=LLM_SYSTEM_PROMPT, 
        **api_cfg
    )
    Settings.embed_model = OpenAIEmbedding(
        model_name=ONLINE_EMBEDDING_MODEL, 
        dimensions=1024, # 强制缩减为 1024 维，以匹配现有知识库向量维度
        embed_batch_size=EMBED_BATCH_SIZE, 
        **api_cfg
    )

    # 3. 注入分块参数
    Settings.chunk_size, Settings.chunk_overlap = CHUNK_SIZE, CHUNK_OVERLAP

    print(f"DEBUG: [RAG Init] 🚀 Global Settings Initialized")
    print(f"DEBUG: [RAG Init] - LLM Model: {ONLINE_LLM_MODEL}")
    print(f"DEBUG: [RAG Init] - Embed Model: {ONLINE_EMBEDDING_MODEL} (Dimensions: 1024)")
    print(f"DEBUG: [RAG Init] - Base URL: {API_BASE_URL}")
    print(f"DEBUG: [RAG Init] - API Key Prefix: {API_KEY[:6]}...{API_KEY[-4:] if API_KEY else ''}")
