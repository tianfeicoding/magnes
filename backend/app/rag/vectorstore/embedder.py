"""
embedder.py - Gemini text-embedding-004 向量化器
将文本转换为 768 维度的向量，通过 302.AI 代理访问
"""
import os
import httpx
from typing import Optional, List, Any
from llama_index.core.embeddings import BaseEmbedding
from pydantic import Field


def _prepare_embedding_payload(input_data: Any) -> dict:
    """
    构建请求 Payload
    input_data 可以是单字符串或字符串列表
    """
    from app.rag.config import ONLINE_EMBEDDING_MODEL
    
    if isinstance(input_data, str):
        safe_text = input_data[:3000].strip() or "空内容"
        inputs = [safe_text]
    else:
        # 批量处理，限制单条长度
        inputs = [t[:3000].strip() or "空内容" for t in input_data]
        
    return {
        "model": ONLINE_EMBEDDING_MODEL,
        "input": inputs,
        "dimensions": 1024  # [新增] 强制要求返回 1024 维，以适配 ChromaDB 既有集合
    }

def _process_embedding_response(resp: httpx.Response, is_batch: bool = False) -> Any:
    """处理 API 响应"""
    if resp.status_code != 200:
        print(f"[Embedder] ❌ API 报错 {resp.status_code}: {resp.text[:500]}")
    resp.raise_for_status()
    data = resp.json()
    
    # 响应格式示例: {"data": [{"embedding": [...]}, {"embedding": [...]}]}
    try:
        if is_batch:
            return [item["embedding"] for item in data["data"]]
        return data["data"][0]["embedding"]
    except (KeyError, IndexError) as e:
        print(f"[Embedder] ❌ 响应结构异常: {data}")
        raise e

def embed_text_sync(text: str) -> Optional[List[float]]:
    """同步版本的向量化接口"""
    import time
    import asyncio
    from app.core.llm_config import get_llm_config

    print(f"[Embedder] 🚀 embed_text_sync 开始执行...")

    # 获取配置（同步兼容）
    base_url = None
    api_key = None
    try:
        loop = asyncio.get_event_loop()
        print(f"[Embedder] 📝 当前事件循环状态: is_running={loop.is_running()}")
        if loop.is_running():
            # 如果事件循环正在运行，使用 run_coroutine_threadsafe
            print("[Embedder] ⏳ 使用 run_coroutine_threadsafe 获取配置 (timeout=5s)...")
            future = asyncio.run_coroutine_threadsafe(get_llm_config(), loop)
            base_url, api_key = future.result(timeout=5)
            print("[Embedder] ✅ 通过 threadsafe 获取配置成功")
        else:
            print("[Embedder] ⏳ 使用 run_until_complete 获取配置...")
            base_url, api_key = loop.run_until_complete(get_llm_config())
            print("[Embedder] ✅ 通过 run_until_complete 获取配置成功")
    except asyncio.TimeoutError:
        print("[Embedder] ⚠️ 获取配置超时 (5s)，使用默认值")
        from app.rag.config import _DEFAULT_BASE_URL, API_KEY
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY
    except Exception as e:
        print(f"[Embedder] ⚠️ 获取配置失败: {e}，使用默认值")
        from app.rag.config import _DEFAULT_BASE_URL, API_KEY
        base_url = _DEFAULT_BASE_URL
        api_key = API_KEY

    if not base_url:
        print("[Embedder] ❌ 无法获取 base_url，返回 None")
        return None

    if not api_key:
        print("[Embedder] ⚠️ 未配置 API 密钥")
        return None

    payload = _prepare_embedding_payload(text)
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=40.0) as client:
                print(f"[Embedder] 正在同步请求 Embedding (尝试 {attempt+1}/{max_retries}), 长度: {len(text)}")
                resp = client.post(
                    f"{base_url}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload
                )
                if resp.status_code in [502, 503, 504] and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"[Embedder] ⚠️ 遇到 {resp.status_code}，正在进行指数退避重试 ({wait_time}s)...")
                    time.sleep(wait_time)
                    continue
                emb = _process_embedding_response(resp)
                print(f"[Embedder] ✅ 同步请求成功.")
                return emb
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            print(f"[Embedder] ❌ 同步向量化最终失败: {str(e)[:100]}")
    return None

def embed_text_batch_sync(texts: List[str]) -> List[List[float]]:
    """批量同步版本的向量化接口"""
    import time
    import asyncio
    from app.core.llm_config import get_llm_config

    # 获取配置（同步兼容）
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            future = asyncio.run_coroutine_threadsafe(get_llm_config(), loop)
            base_url, api_key = future.result(timeout=10)
        else:
            base_url, api_key = loop.run_until_complete(get_llm_config())
    except Exception as e:
        print(f"[Embedder] ⚠️ 获取配置失败: {e}")
        return [[0.0] * 1024] * len(texts)

    if not api_key or not texts:
        return [[0.0] * 1024] * len(texts)

    payload = _prepare_embedding_payload(texts)
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=60.0) as client:
                print(f"[Embedder] 正在批量同步请求 Embedding (尝试 {attempt+1}/{max_retries}), 数量: {len(texts)}")
                resp = client.post(
                    f"{base_url}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload
                )
                if resp.status_code in [502, 503, 504] and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"[Embedder] ⚠️ 遇到 {resp.status_code}，正在进行指数退避重试 ({wait_time}s)...")
                    time.sleep(wait_time)
                    continue
                embs = _process_embedding_response(resp, is_batch=True)
                print(f"[Embedder] ✅ 批量请求成功.")
                return embs
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            print(f"[Embedder] ❌ 批量向量化最终失败: {str(e)[:100]}")

    return [[0.0] * 1024] * len(texts)

async def embed_text(text: str) -> Optional[list[float]]:
    """异步版本的向量化接口 (带自动重试)"""
    from app.core.llm_config import get_llm_config
    import asyncio

    # 获取配置
    try:
        base_url, api_key = await get_llm_config()
    except Exception as e:
        print(f"[Embedder] ⚠️ 获取配置失败: {e}")
        return None

    if not api_key:
        print("[Embedder] ⚠️ 未配置 API 密钥")
        return None
    
    payload = _prepare_embedding_payload(text)
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.post(
                    f"{base_url}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload
                )
                if resp.status_code in [502, 503, 504] and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"[Embedder] ⚠️ 遇到 {resp.status_code}，正在进行异步指数退避重试 ({wait_time}s)...")
                    await asyncio.sleep(wait_time)
                    continue
                return _process_embedding_response(resp)
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
            print(f"[Embedder] ❌ 异步向量化最终失败: {str(e)[:100]}")
    return None

async def embed_text_batch(texts: List[str]) -> List[List[float]]:
    """[NEW] 异步批量向量化：显著减少入库时的 HTTP 往返次数"""
    from app.core.llm_config import get_llm_config
    import asyncio

    # 获取配置
    try:
        base_url, api_key = await get_llm_config()
    except Exception as e:
        print(f"[Embedder] ⚠️ 获取配置失败: {e}")
        return [[0.0] * 1024] * len(texts)

    if not api_key or not texts:
        return [[0.0] * 1024] * len(texts)
    
    payload = _prepare_embedding_payload(texts)
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                print(f"[Embedder] 正在异步批量请求 Embedding ({len(texts)} 条)...")
                resp = await client.post(
                    f"{base_url}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload
                )
                if resp.status_code in [502, 503, 504] and attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"[Embedder] ⚠️ 遇到 {resp.status_code}，正在进行异步批量指数退避重试 ({wait_time}s)...")
                    await asyncio.sleep(wait_time)
                    continue
                return _process_embedding_response(resp, is_batch=True)
        except Exception as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
            print(f"[Embedder] ❌ 异步批量向量化失败: {str(e)[:100]}")

    return [[0.0] * 1024] * len(texts)


class MagnesEmbedding(BaseEmbedding):
    """
    LlamaIndex 兼容的 Embedding 包装器。
    巧妙处理同步/异步调用，避免 RuntimeError。
    """
    model_name: str = Field(default="qwen3-embedding-8b")
    
    def __init__(self, **kwargs: Any) -> None:
        from app.rag.config import ONLINE_EMBEDDING_MODEL, EMBED_BATCH_SIZE
        kwargs.setdefault("model_name", ONLINE_EMBEDDING_MODEL)
        kwargs.setdefault("embed_batch_size", EMBED_BATCH_SIZE)
        super().__init__(**kwargs)

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return await embed_text(query) or [0.0] * 1024

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return await embed_text(text) or [0.0] * 1024

    def _get_query_embedding(self, query: str) -> List[float]:
        return embed_text_sync(query) or [0.0] * 1024

    def _get_text_embedding(self, text: str) -> List[float]:
        return embed_text_sync(text) or [0.0] * 1024

    def _get_text_embeddings(self, texts: List[str]) -> List[List[float]]:
        """LlamaIndex 关键：批量获取文本向量"""
        return embed_text_batch_sync(texts)


def build_embed_text(doc) -> str:
    """
    构建用于向量化的文本
    策略：visual_description 为主，title/ocr_text 为辅
    目的：让向量同时捕获视觉特征和文字特征
    
    Args:
        doc: NoteDocument 或 GalleryDocument
    """
    parts = []
    
    if hasattr(doc, 'visual_description') and doc.visual_description:
        parts.append(doc.visual_description)
    
    if hasattr(doc, 'title') and doc.title:
        parts.append(doc.title)
    
    if hasattr(doc, 'ocr_text') and doc.ocr_text:
        parts.append(doc.ocr_text)
    
    if hasattr(doc, 'skill_name') and doc.skill_name:
        parts.append(doc.skill_name)
    
    if hasattr(doc, 'style_tags') and doc.style_tags:
        parts.append(" ".join(doc.style_tags))
    
    if hasattr(doc, 'content') and doc.content:
        parts.append(doc.content)
        
    return "\n".join(parts) if parts else "空内容"
