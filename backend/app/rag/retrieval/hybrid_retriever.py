"""
hybrid_retriever.py - RRF 混合检索融合
将向量检索（dense）和关键词检索（BM25）结果通过 RRF 算法融合
"""
from typing import Optional


def rrf_fusion(
    dense_results: list[dict],
    bm25_results: list[dict],
    k: int = 60,
    dense_weight: float = 0.6,
    bm25_weight: float = 0.4
) -> list[dict]:
    """
    RRF (Reciprocal Rank Fusion) 融合算法
    
    公式：score(d) = dense_weight × Σ(1/(k+rank_dense))
                   + bm25_weight  × Σ(1/(k+rank_bm25))
    
    Args:
        dense_results: 向量检索结果（已按分数排序）
        bm25_results:  BM25 检索结果（已按分数排序）
        k:             RRF 超参数，默认 60（平滑排名影响）
        dense_weight:  向量检索权重
        bm25_weight:   BM25 权重
    
    Returns:
        融合后的结果列表（去重，按 RRF 分排序）
    """
    # 版本 Gallery 内部数据加权（用户自己的生成结果更精准）
    WEIGHT_BOOST = {
        "version_gallery": 1.5,
        "xhs_covers": 1.0,
        "knowledge_base": 1.2
    }
    
    # 构建 doc_id → metadata/content 映射
    doc_map = {}
    
    # 计算 dense 的 RRF 分数
    dense_scores = {}
    for rank, item in enumerate(dense_results):
        doc_id = item["doc_id"]
        boost = WEIGHT_BOOST.get(item.get("source_type", ""), 1.0)
        score = dense_weight * (1.0 / (k + rank + 1)) * boost
        dense_scores[doc_id] = dense_scores.get(doc_id, 0) + score
        doc_map[doc_id] = item
    
    # 计算 BM25 的 RRF 分数
    bm25_scores = {}
    for rank, item in enumerate(bm25_results):
        doc_id = item["doc_id"]
        boost = WEIGHT_BOOST.get(item.get("source_type", ""), 1.0)
        score = bm25_weight * (1.0 / (k + rank + 1)) * boost
        bm25_scores[doc_id] = bm25_scores.get(doc_id, 0) + score
        if doc_id not in doc_map:
            doc_map[doc_id] = item
    
    # 合并分数
    all_doc_ids = set(list(dense_scores.keys()) + list(bm25_scores.keys()))
    fused_scores = {}
    for doc_id in all_doc_ids:
        fused_scores[doc_id] = dense_scores.get(doc_id, 0) + bm25_scores.get(doc_id, 0)
    
    # 排序并返回
    sorted_docs = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
    
    results = []
    for doc_id, rrf_score in sorted_docs:
        item = doc_map[doc_id].copy()
        item["rrf_score"] = rrf_score
        results.append(item)
    
    return results


async def hybrid_search(
    query: str,
    top_k: int = 20,
    dense_weight: float = 0.6,
    bm25_weight: float = 0.4,
    include_knowledge: bool = True
) -> list[dict]:
    """
    混合检索主入口
    自动调整权重策略：
    - 如果 query 包含视觉描述词 → Dense 优先 (0.7/0.3)
    - 如果 query 是具体实体词 → BM25 优先 (0.4/0.6)
    - 默认均衡 (0.6/0.4)
    
    Args:
        include_knowledge: 是否同时检索通用知识库
    """
    from app.rag.retrieval.dense_retriever import dense_search
    from app.rag.retrieval.bm25_retriever import bm25_search
    
    # 自动权重调整
    visual_keywords = ['风格', '色调', '暖', '冷', '渐变', '简约', '复古', '清新', '梦幻', '暗黑']
    if any(kw in query for kw in visual_keywords):
        dense_weight, bm25_weight = 0.7, 0.3  # 语义为主
    
    # 确定检索范围
    collections = ["xhs_covers", "version_gallery"]
    if include_knowledge:
        collections.append("knowledge_base")
    
    # 并发检索
    import asyncio
    dense_future = dense_search(query, top_k=top_k, collections=collections)
    bm25_future = bm25_search(query, top_k=top_k)
    
    dense_results, bm25_results = await asyncio.gather(dense_future, bm25_future)
    
    # RRF 融合
    fused = rrf_fusion(dense_results, bm25_results, dense_weight=dense_weight, bm25_weight=bm25_weight)
    
    # Parent 回溯：对知识库的 Child Chunk，回溯获取 Parent 上下文
    if include_knowledge:
        from app.rag.vectorstore.chroma_store import get_parent_chunk
        for item in fused:
            if item.get("source_type") == "knowledge_base":
                parent_id = item.get("metadata", {}).get("parent_chunk_id", "")
                if parent_id:
                    parent = await get_parent_chunk(parent_id)
                    if parent:
                        item["parent_content"] = parent["content"]
                        item["visual_description"] = parent["content"]  # 用完整上下文供 Reranker
    
    return fused[:top_k]
