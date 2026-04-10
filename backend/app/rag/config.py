import os
from pathlib import Path
from dotenv import load_dotenv

# 定位项目根目录 (magnes/backend)
# __file__ is magnes/backend/app/rag/config.py
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

# 加载 .env 文件 (仅作为开发备用，生产环境应从数据库读取)
load_dotenv(BACKEND_DIR / ".env")

# --- 模型 identifiers ---
ONLINE_EMBEDDING_MODEL = "text-embedding-3-small"
ONLINE_LLM_MODEL = "gpt-4o"

# 默认业务模型分配 (从环境变量读取，但会被数据库配置覆盖)
DEFAULT_PLANNER_MODEL = os.getenv("PLANNER_MODEL", ONLINE_LLM_MODEL)
DEFAULT_COPYWRITER_MODEL = os.getenv("COPYWRITER_MODEL", ONLINE_LLM_MODEL)
DEFAULT_INSPIRATION_MODEL = os.getenv("INSPIRATION_ANALYST_MODEL", ONLINE_LLM_MODEL)
DEFAULT_KNOWLEDGE_MODEL = os.getenv("KNOWLEDGE_MODEL", ONLINE_LLM_MODEL)
DEFAULT_REFINER_MODEL = os.getenv("REFINER_MODEL", ONLINE_LLM_MODEL)

# --- API配置获取函数 (统一使用 llm_config 的逻辑) ---
async def get_api_config():
    """
    获取 API 配置 (URL 和 Key)
    优先级: 数据库用户设置 > 环境变量
    """
    from app.core.llm_config import get_llm_config
    return await get_llm_config()

# --- 向后兼容的模块级配置 (仅初始化时使用，运行时请使用 get_api_config) ---
# 注意：这些值在模块加载时确定，实际应用中应调用 get_api_config() 获取最新配置
# 保留默认值作为fallback，当数据库配置无法获取时使用
_DEFAULT_BASE_URL = os.getenv("API_BASE_URL", "https://ai.t8star.cn").rstrip('/')
if _DEFAULT_BASE_URL and not _DEFAULT_BASE_URL.endswith('/v1'):
    _DEFAULT_BASE_URL = f"{_DEFAULT_BASE_URL}/v1"

API_BASE_URL = _DEFAULT_BASE_URL
API_KEY = os.getenv("API_KEY", "")

print(f"DEBUG: [config.py] Loaded ONLINE_LLM_MODEL: {ONLINE_LLM_MODEL}")
print(f"DEBUG: [config.py] Initial API_BASE_URL: {API_BASE_URL or 'Not set (will use db config)'}")

# --- LLM 运行参数 ---
LLM_TEMPERATURE = 0.1
LLM_SYSTEM_PROMPT = "你是一个专业的 AI 辅助助理，擅长根据背景知识回答问题。"
EMBED_BATCH_SIZE = 200  #  极大提升批量向量化效率，减少网络往返
SEMANTIC_COMPLEXITY_THRESHOLD = 800  #  路由预判阈值：超过此长度才启动语义切分
HEADING_ROUTING_THRESHOLD = 1200     #  标题优先路由阈值：Section 长度低于此值则跳过细切
PROPOSITION_EXTRACTION_THRESHOLD = 500 #  原子命题提取阈值：Parent 长度超过此值才触发提取

# --- 文件与路径配置  ---
DATA_DIR = BACKEND_DIR / "data"
# ChromaDB 存储路径
CHROMA_DATA_PATH = str(DATA_DIR / "chromadb")
# 文档上传临时存储
UPLOAD_DIR = str(DATA_DIR / "uploads")
# 知识库文档存储
KNOWLEDGE_DIR = str(DATA_DIR / "knowledge")

# 确保必要目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(KNOWLEDGE_DIR, exist_ok=True)

# --- 文本分块设置 (Manual Chunking) ---
PARENT_CHUNK_SIZE = 1500           # 父块目标大小（字符）
CHILD_CHUNK_SIZE = 300             # 子块目标大小（字符/Token）
CHILD_OVERLAP = 50                 # 子块重叠窗口（字符/Token）

# --- 语义分块设置 (Semantic Chunking) ---
SEMANTIC_BREAKPOINT_THRESHOLD = 95  # 语义断点阈值（百分比）
SEMANTIC_BUFFER_SIZE = 1            # 语义切分缓冲区大小
HYBRID_MAX_CHUNK_SIZE = 300         # 语义切分后的最大 Token 数（触发二次切分）

# --- 旧版兼容配置 ---
CHUNK_SIZE = 600
CHUNK_OVERLAP = 120
MIN_CHUNK_SIZE = 200
MAX_CHUNK_SIZE_BEFORE_SPLIT = 800
TITLE_MERGE_THRESHOLD = 100

# --- 检索配置 ---
DEFAULT_RETRIEVAL_K = 5            # 默认检索召回数量
DEFAULT_RETRIEVAL_THRESHOLD = 0.4  # 默认相似度阈值 (余弦相似度)
CHUNK_PREVIEW_LENGTH = 200         # 前端预览分块时的字符限制

# --- 模型获取助手 ---

async def get_llm_async():
    """获取全局 LLM 实例（异步，从数据库读取配置）"""
    from llama_index.llms.openai import OpenAI
    from app.core.llm_config import get_llm_config
    base_url, api_key = await get_llm_config()
    return OpenAI(
        model=ONLINE_LLM_MODEL,
        temperature=LLM_TEMPERATURE,
        system_prompt=LLM_SYSTEM_PROMPT,
        api_key=api_key,
        api_base=base_url
    )

def get_llm():
    """获取全局 LLM 实例（兼容旧版，从数据库读取配置，失败时使用环境变量默认值）"""
    from llama_index.llms.openai import OpenAI
    import asyncio
    from app.core.llm_config import get_llm_config

    print("[RAG Config] 🚀 get_llm() 被调用...")
    base_url = None
    api_key = None

    try:
        loop = asyncio.get_event_loop()
        print(f"[RAG Config] 📝 事件循环状态: is_running={loop.is_running()}")
        if loop.is_running():
            print("[RAG Config] ⏳ 使用 run_coroutine_threadsafe (timeout=3s)...")
            future = asyncio.run_coroutine_threadsafe(get_llm_config(), loop)
            base_url, api_key = future.result(timeout=3)
            print("[RAG Config] ✅ 从数据库获取配置成功")
        else:
            print("[RAG Config] ⏳ 使用 run_until_complete...")
            base_url, api_key = loop.run_until_complete(get_llm_config())
            print("[RAG Config] ✅ 从数据库获取配置成功")
    except asyncio.TimeoutError:
        print("[RAG Config] ⚠️ 获取配置超时 (3s)，使用环境变量默认值")
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY
    except Exception as e:
        print(f"[RAG Config] ⚠️ 从数据库获取配置失败: {e}，使用环境变量默认值")
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY

    if not base_url:
        raise ValueError("无法获取 LLM 配置，请在设置界面配置 API 信息或在环境变量中设置 API_BASE_URL")

    print(f"[RAG Config] ✅ 返回 OpenAI 实例，base_url={base_url[:30]}...")
    return OpenAI(
        model=ONLINE_LLM_MODEL,
        temperature=LLM_TEMPERATURE,
        system_prompt=LLM_SYSTEM_PROMPT,
        api_key=api_key,
        api_base=base_url
    )

def get_embed_model():
    """获取全局 Embedding 实例（从数据库读取配置，失败时使用环境变量默认值）"""
    from llama_index.embeddings.openai import OpenAIEmbedding
    import asyncio
    from app.core.llm_config import get_llm_config

    print("[RAG Config] 🚀 get_embed_model() 被调用...")
    base_url = None
    api_key = None

    try:
        loop = asyncio.get_event_loop()
        print(f"[RAG Config] 📝 事件循环状态: is_running={loop.is_running()}")
        if loop.is_running():
            print("[RAG Config] ⏳ 使用 run_coroutine_threadsafe (timeout=3s)...")
            future = asyncio.run_coroutine_threadsafe(get_llm_config(), loop)
            base_url, api_key = future.result(timeout=3)
            print("[RAG Config] ✅ 从数据库获取配置成功")
        else:
            print("[RAG Config] ⏳ 使用 run_until_complete...")
            base_url, api_key = loop.run_until_complete(get_llm_config())
            print("[RAG Config] ✅ 从数据库获取配置成功")
    except asyncio.TimeoutError:
        print("[RAG Config] ⚠️ 获取配置超时 (3s)，使用环境变量默认值")
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY
    except Exception as e:
        print(f"[RAG Config] ⚠️ 从数据库获取配置失败: {e}，使用环境变量默认值")
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY

    if not base_url:
        raise ValueError("无法获取 Embedding 配置，请在设置界面配置 API 信息或在环境变量中设置 API_BASE_URL")

    print(f"[RAG Config] ✅ 返回 OpenAIEmbedding 实例，base_url={base_url[:30]}...")
    return OpenAIEmbedding(
        model_name=ONLINE_EMBEDDING_MODEL,
        dimensions=1024,
        embed_batch_size=EMBED_BATCH_SIZE,
        api_key=api_key,
        api_base=base_url
    )
