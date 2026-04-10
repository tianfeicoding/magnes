from typing import List, Optional
from llama_index.core import StorageContext, get_response_synthesizer
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.postprocessor import SimilarityPostprocessor
from llama_index.core.postprocessor.types import BaseNodePostprocessor

from app.rag.vectorstore.chroma_store import get_llama_storage_context, get_llama_vector_store, get_knowledge_collection, get_xhs_collection
from app.rag.config import DEFAULT_RETRIEVAL_K, DEFAULT_RETRIEVAL_THRESHOLD

# --- 全局检索器缓存 (用于提升 BM25 性能) ---
_cached_bm25_retrievers = {}


class RecursivePropositionPostprocessor(BaseNodePostprocessor):
    """
    命题回溯后处理器 (Small-to-Big):
    如果召回的是 child 命题，则根据 parent_chunk_id 自动替换为 parent 完整上下文。
    """
    def _postprocess_nodes(self, nodes: List["NodeWithScore"], query_bundle: Optional["QueryBundle"] = None) -> List["NodeWithScore"]:
        unique_parents = {}
        final_nodes = []
        
        collection = get_knowledge_collection()
        
        for node_with_score in nodes:
            node = node_with_score.node
            meta = node.metadata
            chunk_type = meta.get("chunk_type", "parent")
            parent_id = meta.get("parent_chunk_id")
            
            if chunk_type == "child" and parent_id:
                # 如果已经处理过该父块，跳过以防冗余
                if parent_id in unique_parents:
                    continue
                
                # 从数据库捞取父块内容
                print(f"DEBUG: [Postprocessor] 🔄 Child hit ({node.node_id}), fetching parent: {parent_id}")
                try:
                    res = collection.get(ids=[parent_id])
                    if res and res["ids"]:
                        # 替换内容和元数据
                        node.text = str(res["documents"][0])
                        node.metadata.update(res["metadatas"][0])
                        unique_parents[parent_id] = True
                except Exception as e:
                    print(f"DEBUG: [Postprocessor] ⚠️ Fetch parent failed: {e}")
            
            final_nodes.append(node_with_score)
            
        return final_nodes

def get_auto_merging_query_engine(collection_name: str = "knowledge_base_v2"):
    """
    获取自动合并检索查询引擎
    """
    # 1. 获取存储上下文
    storage_context = get_llama_storage_context(collection_name)
    
    # 2. 从存储中恢复索引 (如果已存在)
    # 注意：这里假设已经在 Ingestion 阶段通过 StorageContext 存入了 docstore
    # 实际项目中需要确保 HierarchicalNodeParser 处理后的 nodes 已存入 storage_context.docstore
    
    # 3. 创建基础检索器 (针对子块)
    vector_store = get_llama_vector_store(collection_name)
    base_retriever = vector_store.as_retriever(similarity_top_k=DEFAULT_RETRIEVAL_K * 2)
    
    # 4. 创建自动合并检索器
    # 它会检查 base_retriever 返回的 nodes，如果某个 Parent 的足够多 Children 被选中，则自动合并
    automerging_retriever = AutoMergingRetriever(
        base_retriever, 
        storage_context, 
        verbose=True
    )
    
    # 5. 配置响应合成器
    response_synthesizer = get_response_synthesizer(response_mode="compact")
    
    # 6. 创建查询引擎
    query_engine = RetrieverQueryEngine.from_args(
        retriever=automerging_retriever,
        response_synthesizer=response_synthesizer,
        node_postprocessors=[
            SimilarityPostprocessor(similarity_cutoff=DEFAULT_RETRIEVAL_THRESHOLD)
        ]
    )
    
    return query_engine

async def llama_search_knowledge(query: str, top_k: int = 5):
    """
    知识库搜索入口 (LlamaIndex 版)
    集成混合检索与命题回溯
    """
    # 这里我们切换为混合检索器以获得更好效果
    retriever = get_query_fusion_retriever(top_k=top_k)
    
    # 手动执行后处理
    nodes = retriever.retrieve(query)
    
    # 命题回溯 (Small-to-Big)
    postprocessor = RecursivePropositionPostprocessor()
    nodes = postprocessor.postprocess_nodes(nodes)
    
    results = []
    for node in nodes[:top_k]:
        results.append({
            "doc_id": node.node.node_id,
            "content": node.node.get_content(),
            "score": node.score,
            "metadata": node.node.metadata,
            "is_expanded": node.node.metadata.get("chunk_type") == "parent"
        })
    return results

def get_query_fusion_retriever(
    collection_name: str = "knowledge_base", 
    num_queries: int = 3,
    top_k: int = DEFAULT_RETRIEVAL_K,
    filters = None
):
    """
    获取混合查询融合检索器 (Query Fusion + RRF)
    """
    from llama_index.core import VectorStoreIndex
    from llama_index.core.retrievers import QueryFusionRetriever
    from llama_index.retrievers.bm25 import BM25Retriever
    import jieba
    
    # 1. 获取向量索引
    vector_store = get_llama_vector_store(collection_name)
    index = VectorStoreIndex.from_vector_store(vector_store)
    
    # 2. 向量检索器 (用于语义搜索)
    vector_retriever = index.as_retriever(similarity_top_k=top_k * 2, filters=filters)
    
    # 3. BM25 检索器 (用于关键词搜索) - [OPTIMIZED] 引入单例缓存减少重复构建耗时
    global _cached_bm25_retrievers
    
    if collection_name in _cached_bm25_retrievers:
        print(f"DEBUG: [llama_retriever.py] ⚡ Using cached BM25 Retriever for {collection_name}")
        bm25_retriever = _cached_bm25_retrievers[collection_name]
    else:
        # 修复：不再通过 vector_retriever.retrieve("") 采样
        # 而是直接从 Chroma 获取全量节点用于构建关键词索引
        from llama_index.core.schema import TextNode
        
        import time
        print(f"DEBUG: [llama_retriever.py] 📥 Initializing BM25 Index for {collection_name} (First run)...")
        t0 = time.time()
        
        # 动态选择集合
        if collection_name.startswith("xhs_covers"):
            collection = get_xhs_collection()
        else:
            collection = get_knowledge_collection()
            
        # 获取全量文档内容和元数据
        all_chunks = collection.get(include=["documents", "metadatas"])
        print(f"DEBUG: [llama_retriever.py] 📥 Fetched {len(all_chunks.get('ids', []))} chunks in {time.time()-t0:.2f}s")
        
        nodes = []
        if all_chunks and all_chunks["ids"]:
            for i in range(len(all_chunks["ids"])):
                meta = all_chunks["metadatas"][i]
                content = all_chunks["documents"][i]
                heading = meta.get("heading_path", "")
                
                # 增强：为了让 BM25 能搜到标题里的关键词，将 heading 拼接到内容中
                indexed_text = f"{heading}\n{content}" if heading else content
                
                nodes.append(TextNode(
                    text=indexed_text,
                    id_=all_chunks["ids"][i],
                    metadata=meta
                ))
        
        if not nodes:
            # 降级：如果库为空，返回纯向量检索器
            return vector_retriever

        # 如果有 ID 过滤器，则仅针对过滤后的节点构建 BM25 索引
        if filters and filters.filters:
            # 提取所有允许的 doc_ids
            allowed_ids = []
            for f in filters.filters:
                if f.key == "doc_id":
                    if isinstance(f.value, list): allowed_ids.extend(f.value)
                    else: allowed_ids.append(f.value)
            
            if allowed_ids:
                from llama_index.core.vector_stores import FilterOperator
                # 简单过滤 nodes 列表
                nodes = [n for n in nodes if n.metadata.get("doc_id") in allowed_ids]
                print(f"DEBUG: [llama_retriever.py] 🎯 BM25 filtered to {len(nodes)} nodes (allowed: {allowed_ids})")
                
                if not nodes:
                    return vector_retriever
        bm25_retriever = BM25Retriever.from_defaults(
            nodes=nodes, 
            tokenizer=lambda x: jieba.lcut(str(x)),
            similarity_top_k=top_k * 2
        )
        # 存入缓存
        _cached_bm25_retrievers[collection_name] = bm25_retriever
        print(f"DEBUG: [llama_retriever.py] 🧠 BM25 Retriever initialized and cached in {time.time()-t0:.2f}s")
    
    print(f"DEBUG: [llama_retriever.py] 🛠️ Creating QueryFusionRetriever...")
    print(f"DEBUG: [llama_retriever.py] - Collection: {collection_name}")
    print(f"DEBUG: [llama_retriever.py] - Top K: {top_k}")
    
    # 3. 创建融合检索器
    fusion_retriever = QueryFusionRetriever(
        [vector_retriever, bm25_retriever],
        similarity_top_k=top_k,
        num_queries=1,  # 临时限制为 1 以绕过 deepseek-r1 模型名称验证错误
        mode="reciprocal_rerank", # RRF 算法
        use_async=True,
        verbose=True
    )
    
    return fusion_retriever
