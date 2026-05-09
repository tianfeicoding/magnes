"""
dense_retriever.py - 向量检索（余弦相似度）
使用 ChromaDB cosine similarity search
"""
from typing import Optional

from app.rag.vectorstore.embedder import embed_text
from app.rag.vectorstore.chroma_store import vector_search


async def dense_search(
    query: str,
    collections: list[str] = ["xhs_covers", "version_gallery"],
    top_k: int = 20,
    filters: Optional[dict] = None
) -> list[dict]:
    """
    向量检索
    
    Args:
        query: 用户查询文本
        collections: 要检索的 collection 列表
        top_k: 返回结果数量
        filters: metadata 过滤条件（如 {"rating": "good"}）
    
    Returns:
        (doc_id, score, metadata) 列表，按 score 降序
    """
    # 将 query 向量化
    query_embedding = await embed_text(query)
    
    if query_embedding is None:
        print("[Dense Retriever] ⚠️ 向量化失败，跳过密集检索")
        return []
    
    # 向量检索
    results = await vector_search(
        query_embedding=query_embedding,
        collection_names=collections,
        top_k=top_k,
        where=filters
    )
    
    return results
