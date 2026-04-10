"""
style_memory_agent.py - 风格记忆代理（对外主入口）
供 Planner Agent 调用，执行完整的 RAG 检索流程：
hybrid_search(dense+BM25) → llm_reranker → 注入 Planner Prompt
"""
from typing import Optional


async def retrieve(
    query: str,
    skill_name: Optional[str] = None,
    top_k: int = 3,
    selected_doc_ids: Optional[list[str]] = None
) -> list[dict]:
    """
    执行完整风格检索流程，返回 top-k 风格参考
    
    Pipeline:
    1. 调用 hybrid_search（dense 0.6 + bm25 0.4，RRF 融合 top-20）
    2. 调用 llm_reranker（Gemini Flash 精排 top-3）
    
    Args:
        query:      用户创作意图（如"制作暖色调咖啡店封面"）
        skill_name: 当前激活技能（如"手绘地图"）
        top_k:      返回结果数量（默认 3）
    
    Returns:
        经过 Reranker 排序的 top-k 风格参考列表
        每条包含：doc_id, image_url, visual_description, style_tags, rank, reason
    """
    from app.rag.retrieval.workflow import run_style_retrieval
    
    try:
        # 使用 LlamaIndex Workflow 驱动的异步检索流 (包含检索与重排)
        results_dict = await run_style_retrieval(
            query=query,
            skill_name=skill_name or "",
            top_k=top_k,
            selected_doc_ids=selected_doc_ids
        )
        return results_dict.get("results", [])
        
    except Exception as e:
        print(f"[StyleMemoryAgent] ❌ 检索失败: {e}")
        return []


def build_style_context_block(results: list[dict]) -> str:
    """
    将 top-k 风格参考格式化为 Planner 可理解的文本块
    注入到 Planner Prompt 的 ## 参考风格 部分
    """
    if not results:
        return ""
    
    lines = ["## 参考风格（来自用户收藏 + 历史生成）\n"]
    for r in results:
        reason = r.get("reason", "风格匹配")
        visual_desc = r.get("visual_description", "")[:150]
        style_tags = r.get("style_tags", [])
        
        lines.append(
            f"**参考 {r.get('rank', '?')}**（{reason}）\n"
            f"- 视觉描述：{visual_desc}\n"
            f"- 风格标签：{', '.join(style_tags)}\n"
        )
    
    lines.append("请在生成方案时参考以上风格偏好，但不必完全复制。\n")
    return "\n".join(lines)
