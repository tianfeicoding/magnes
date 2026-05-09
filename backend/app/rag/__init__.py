# RAG 模块 - Magnes Style Memory System
from .config import (
    API_KEY, API_BASE_URL,
    ONLINE_LLM_MODEL, ONLINE_EMBEDDING_MODEL,
    LLM_TEMPERATURE, LLM_SYSTEM_PROMPT,
    EMBED_BATCH_SIZE, CHUNK_SIZE, CHUNK_OVERLAP
)

async def init_rag_settings():
    """
    初始化 LlamaIndex 全局配置
    从数据库读取 API 配置（优先），失败时回退到环境变量
    """
    from llama_index.core import Settings
    from llama_index.llms.openai import OpenAI
    from llama_index.embeddings.openai import OpenAIEmbedding
    from .config import get_api_config

    # 1. 从数据库获取配置（优先），失败时回退到环境变量
    try:
        base_url, api_key = await get_api_config()
        print(f"DEBUG: [RAG Init] ✅ 从数据库获取配置成功")
    except Exception as e:
        print(f"DEBUG: [RAG Init] ⚠️ 从数据库获取配置失败: {e}，使用环境变量默认值")
        base_url = API_BASE_URL
        api_key = API_KEY

    # 2. 提取公共 API 参数
    api_cfg = {"api_key": api_key, "api_base": base_url}

    # 3. 注入核心模型 (利用字典解包)
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

    # 4. 注入分块参数
    Settings.chunk_size, Settings.chunk_overlap = CHUNK_SIZE, CHUNK_OVERLAP

    print(f"DEBUG: [RAG Init] 🚀 Global Settings Initialized")
    print(f"DEBUG: [RAG Init] - LLM Model: {ONLINE_LLM_MODEL}")
    print(f"DEBUG: [RAG Init] - Embed Model: {ONLINE_EMBEDDING_MODEL} (Dimensions: 1024)")
    print(f"DEBUG: [RAG Init] - Base URL: {base_url}")
    print(f"DEBUG: [RAG Init] - API Key Prefix: {api_key[:6]}...{api_key[-4:] if api_key else ''}")
