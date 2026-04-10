from typing import List, Optional, Any
from llama_index.core.workflow import (
    Workflow,
    Event,
    StartEvent,
    StopEvent,
    Context,
    step
)
from app.rag.retrieval.llama_retriever import get_query_fusion_retriever
from app.rag.reranker.llm_reranker import rerank
from app.rag.config import DEFAULT_RETRIEVAL_K

# --- 事件定义 ---

class ProgressEvent(Event):
    """中间过程进度事件"""
    msg: str

class RetrieveEvent(Event):
    """检索完成事件"""
    query: str
    nodes: List[Any]
    rewritten_queries: List[str] = []

class RerankEvent(Event):
    """排序完成事件"""
    results: List[dict]
    rewritten_queries: List[str] = []
    original_count: int = 0  # [NEW] 过滤前的总数

class QueryRewriteEvent(Event):
    """问题改写完成事件"""
    original_query: str
    rewritten_queries: List[str]
    collection: Optional[str] = None
    top_k: Optional[int] = None
    selected_doc_ids: Optional[List[str]] = None # [NEW] 用户勾选的文档 ID

# --- 工作流定义 ---

class StyleRetrievalWorkflow(Workflow):
    """
    风格检索工作流
    流程：Start -> Retrieve (Fusion) -> Rerank (LLM) -> Stop
    """
    
    @step
    async def rewrite_query(self, ctx: Context, ev: StartEvent) -> QueryRewriteEvent:
        """步骤 1: 问题改写 (Query Rewriting)"""
        query = ev.get("query")
        collection = ev.get("collection", "knowledge_base")
        top_k = ev.get("top_k")
        selected_doc_ids = ev.get("selected_doc_ids") # [NEW]
        if collection == "xhs_covers_v2":
             return QueryRewriteEvent(original_query=query, rewritten_queries=[query], collection=collection, top_k=top_k, selected_doc_ids=selected_doc_ids)

        from app.core import llm_config
        from openai import AsyncOpenAI
        
        base_url, api_key = await llm_config.get_llm_config()
        if not api_key:
            return QueryRewriteEvent(original_query=query, rewritten_queries=[query], collection=collection, top_k=top_k)

        # 跳过无需改写的极短消息
        SKIP_KEYWORDS = ['上传', '图片', '图']
        if len(query) <= 5 or any(kw in query for kw in SKIP_KEYWORDS):
            print(f"DEBUG: [Workflow] ⚡️ 跳过 Query Rewriting（短指令）: '{query}'")
            return QueryRewriteEvent(original_query=query, rewritten_queries=[query], collection=collection, top_k=top_k)

        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        
        extra_context = ev.get("extra_context") or {}
        summary = extra_context.get("doc_summary", "暂无文档摘要")
        tags = extra_context.get("doc_tags", [])
        tags_str = ", ".join(tags) if tags else "暂无核心标签"

        prompt = f"""
你是一个专业的知识检索助手。你的任务是将用户的**原始问题**改写为 3 个**更具检索针对性的指令**，以便从向量数据库中召回最相关的片段。

--- 检索背景 (Context) ---
【关联文档摘要】：{summary}
【核心搜索关键词】：{tags_str}
-------------------------

改写核心原则 (STRICT RULES)：
1. **意图锚定**：必须保留原问题的核心动词和核心对象。
2. **场景对齐**：根据“关联文档摘要”中描述的业务场景（如：开业拍摄、市集总结、商品清单等）进行改写，**禁止臆造文档中不存在的“品牌规范”或“营销策略”等词汇**。
3. **内容召回导向**：
   - 错误范例：原问“拍什么”，在没有提到规范的文档里改写成“视觉规范中的要求”（❌ 臆造上下文）。
   - 正确范例：结合摘要如果是“拍摄brief”，则改写为“brief 中提到的核心拍摄对象和商品详情”（✅ 忠实于背景）。
4. **多样性扩展**：从不同维度（如：名词解释、具体参数、操作流程）进行扩展。

输出要求：
- 直接输出 3 行改写后的检索指令，每行一个。
- 不要序号、不要前缀、不要任何解释。

原始问题: {query}
改写结果:
"""
        
        try:
            print(f"DEBUG: [Workflow] 🧠 Rewriting query: '{query}'")
            ctx.write_event_to_stream(ProgressEvent(msg=f"🧠 正在根据文档上下文改写搜索意图...\n"))
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}]
            )
            rewritten = [line.strip("- ").strip() for line in response.choices[0].message.content.strip().split("\n") if line.strip()]
            # [Optimization] 将原问题放在第一位，改写放在后面
            queries = ([query] + rewritten)[:4] 
            
            # 提取额外的控制参数
            top_k = ev.get("top_k")
            collection = ev.get("collection")
            
            event = QueryRewriteEvent(
                original_query=query, 
                rewritten_queries=queries,
                collection=collection,
                top_k=top_k,
                selected_doc_ids=selected_doc_ids # [NEW]
            )
            
            print(f"DEBUG: [Workflow] ⬆️ Dispatching QueryRewriteEvent for {len(queries)} queries")
            # 使用 ctx.send_event 将事件推送到外部 handler 的事件队列
            ctx.write_event_to_stream(event)
            return event
        except Exception as e:
            print(f"DEBUG: [Workflow] ⚠️ Rewriting failed: {e}")
            return QueryRewriteEvent(
                original_query=query, 
                rewritten_queries=[query],
                collection=ev.get("collection"),
                top_k=ev.get("top_k"),
                selected_doc_ids=ev.get("selected_doc_ids") # [NEW]
            )

    @step
    async def retrieve(self, ctx: Context, ev: QueryRewriteEvent) -> RetrieveEvent:
        """步骤 2: 执行混合检索 (已改写)"""
        query = ev.original_query
        rewritten_queries = ev.rewritten_queries
        top_k = ev.top_k or 30 # 扩大初筛范围
        collection = ev.collection or "knowledge_base" # 动态获取
        
        # 内部映射：不再强制映射到 V2，直接使用传入的名称（已在 llama_retriever 层级处理）
        target_coll = collection
            
        print(f"DEBUG: [Workflow] 🔍 Multi-search for: {rewritten_queries} in {target_coll}")
        
        #  原生 ID 过滤器
        filters = None
        if ev.selected_doc_ids is not None:
            from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
            # 兼容：如果是单个 ID 使用 ExactMatchFilter，多个使用对应的（但在 Chroma 中多 ID 通常用 in）
            # LlamaIndex 默认 MetadataFilters 支持 list
            filters = MetadataFilters(filters=[
                ExactMatchFilter(key="doc_id", value=ev.selected_doc_ids[0]) if len(ev.selected_doc_ids) == 1 
                else MetadataFilters(filters=[
                    ExactMatchFilter(key="doc_id", value=sid) for sid in ev.selected_doc_ids
                ])
                # 注意：LlamaIndex 的 Standard Filter 不直接支持 IN，我们用并集或多个 ExactMatch
                # 实际上 ChromaVectorStore 里的 MetadataFilters 如果传入多个 Filter 通常是 AND 关系。
                # 更好的做法是由于我们是定向检索，如果不确定 LlamaIndex 的 OR 支持，
                # 且 ID 数量不多，我们可以在 retrieve 层级直接组合。
                # 但根据 LlamaIndex 文档，可以使用 InFilter
            ])
            # 重新引用以确保 InFilter 可用
            from llama_index.core.vector_stores import MetadataFilter, MetadataFilters, FilterOperator
            filters = MetadataFilters(filters=[
                MetadataFilter(key="doc_id", value=ev.selected_doc_ids, operator=FilterOperator.IN)
            ])
            print(f"DEBUG: [Workflow] 🎯 Applied ID Filters: {ev.selected_doc_ids}")

        retriever = get_query_fusion_retriever(
            collection_name=target_coll, 
            top_k=top_k,
            num_queries=len(rewritten_queries),
            filters=filters # [NEW]
        )
        
        # 依次尝试改写后的问题（QueryFusionRetriever 内部会自动合并）
        print(f"DEBUG: [Workflow] 🧬 Executing aretrieve on QueryFusionRetriever...")
        ctx.write_event_to_stream(ProgressEvent(msg=f"🧬 已整合 {len(rewritten_queries)} 个改写意图，正在执行跨库召回...\n"))
        nodes = await retriever.aretrieve(query)
        print(f"DEBUG: [Workflow] ✅ Retrieved {len(nodes)} nodes")
        
        return RetrieveEvent(query=query, nodes=nodes, rewritten_queries=rewritten_queries)

    @step
    async def rerank_results(self, ctx: Context, ev: RetrieveEvent) -> RerankEvent:
        """步骤 2: 使用 LLM 进行智能重排"""
        # 将 Llama Nodes 转换为 Reranker 期望的 candidates 格式
        candidates = []
        for node in ev.nodes:
            candidates.append({
                "doc_id": node.node.node_id,
                "visual_description": node.node.get_content(),
                "metadata": node.node.metadata,
                "score": node.score or 0.0
            })
            
        print(f"[Workflow] ⚖️ 正在进行 LLM 深度重排，候选池大小: {len(candidates)}...")
        ctx.write_event_to_stream(ProgressEvent(msg=f"⚖️ 召回阶段完成（得到 {len(candidates)} 条候选），正在进行深度属性重排与精选...\n"))
        ranked_results = await rerank(
            query=ev.query,
            candidates=candidates,
            top_k=5 # 最终只取最精粉的 5 个
        )
        
        return RerankEvent(
            results=ranked_results, 
            rewritten_queries=ev.rewritten_queries,
            original_count=len(candidates)
        )

    @step
    async def finalize(self, ev: RerankEvent) -> StopEvent:
        """步骤 4: 归档结果并返回"""
        print(f"[Workflow] ✅ 检索重排完成，返回 {len(ev.results)} 条结果 (已从 {ev.original_count} 条中精选)")
        return StopEvent(result={
            "results": ev.results,
            "rewritten_queries": ev.rewritten_queries,
            "stats": {
                "original_count": ev.original_count,
                "final_count": len(ev.results),
                "filtered_out": ev.original_count - len(ev.results)
            }
        })

# --- 便捷调用接口 ---

async def run_style_retrieval(
    query: str, 
    collection: str = "xhs_covers",
    skill_name: str = "",
    top_k: int = DEFAULT_RETRIEVAL_K,
    selected_doc_ids: Optional[List[str]] = None
) -> List[dict]:
    """运行风格检索工作流"""
    wf = StyleRetrievalWorkflow(timeout=90)
    # 将所有参数传递给 StartEvent
    results = await wf.run(
        query=query, 
        collection=collection, 
        skill_name=skill_name, 
        top_k=top_k,
        selected_doc_ids=selected_doc_ids
    )
    return results
