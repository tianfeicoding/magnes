"""
Creative Agent / Copywriter & Analyst Expert
承接了 Planner 中所有关于搜索、知识提取、长文本总结、以及最终配文排版的工具能力。
"""
import json
from typing import Optional, List
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage

from app.core.llm_config import get_llm_config
from app.agents.planner.state import PlannerState
from app.agents.planner.prompts import COPYWRITER_EXPERT_PROMPT, JSON_FORCED_INSTRUCTION
from app.agents.planner.parser import _parse_planner_response

# ---------------- 工具函数执行区 ----------------
async def _execute_ingest_urls(state: PlannerState, decision: dict):
    from app.rag.ingestion.xhs_collector import batch_collect_xhs_notes
    from app.rag.vectorstore.chroma_store import upsert_document
    
    urls = decision.get("parameters", {}).get("urls") or []
    if not urls: 
        reply = "⚠️ 未检测到有效链接。"
        return {"final_decision": {**decision, "reply": reply}, "messages": [AIMessage(content=reply)]}
        
    docs = await batch_collect_xhs_notes(urls)
    success_titles = []
    for doc in docs:
        try:
            await upsert_document(doc)
            success_titles.append(f"《{doc.title}》")
        except: pass
        
    if success_titles:
        reply = f"✅ 已成功解析并存入灵感库：\n" + "\n".join(success_titles)
        from app.rag.retrieval.bm25_retriever import get_bm25_index
        get_bm25_index().mark_dirty()
    else: reply = "❌ 链接解析失败。"
    
    message_content = json.dumps({"thought": decision.get("thought", ""), "action": decision.get("action"), "reply": reply, "refresh_rag": True}, ensure_ascii=False)
    return {"final_decision": {**decision, "reply": reply, "refresh_rag": True}, "messages": [AIMessage(content=message_content)]}

async def _execute_xhs_search(state: PlannerState, decision: dict):
    from app.services.xhs_service import search_xhs_livesearch
    query = decision.get("parameters", {}).get("prompt") or ""
    if not query:
        for msg in reversed(state.get("messages", [])):
            if isinstance(msg, HumanMessage):
                query = str(msg.content)
                break
                
    res = await search_xhs_livesearch(query)
    if res.get("status") == "success":
        search_results = res.get("results") or []
        summary = res.get("summary") or "已抓取最新内容并存入灵感库。"
        message_content = json.dumps({"thought": decision.get("thought", "实时搜索小红书内容。"), "action": "run_xhs_search", "reply": summary, "results": search_results, "refresh_rag": True}, ensure_ascii=False)
        return {"final_decision": {**decision, "reply": summary, "results": search_results, "refresh_rag": True}, "messages": [AIMessage(content=message_content)]}
    else:
        return {"final_decision": {**decision, "reply": "搜索失败"}, "messages": [AIMessage(content="搜索失败")]}

async def _execute_analyze_inspiration(state: PlannerState, decision: dict):
    from app.agents.workers.inspiration_analyst import analyze_inspiration_logic
    from app.core.semantic_service import extract_semantic_content
    from app.core.template_utils import get_available_templates_metadata
    
    query = decision.get("parameters", {}).get("prompt") or ""
    if not query:
        for msg in reversed(state.get("messages", [])):
            if isinstance(msg, HumanMessage):
                query = str(msg.content)
                break
                
    is_structured = any(kw in str(query) for kw in ["时间:", "地点:", "门票:", "时间：", "地点：", "门票："])
    if is_structured or state.get("active_skill") == "ecommerce-image-gen":
        return {"final_decision": {**decision, "results": []}, "structured_content": {"items": [{"title": "活动提取", "description": query}]}}
    
    extra_context = state.get("extra_context") or {}
    extra_instruction = ""
    # 检测全局参数或 Query 中的 Emoji 偏好
    use_emoji = decision.get("parameters", {}).get("useEmoji") or ("emoji" in str(query).lower())
    if use_emoji:
        extra_instruction = "\n(请启用极简 Emoji 模式：直接以图标引导内容，严禁输出“时间：”、“地点：”等文字标题)"
        
    # [Diagnostic] 记录选中 IDs 的传导状态
    selected_ids = extra_context.get("selectedDocIds")
    print(f"[CreativeAgent] 📤 正在分发灵感分析任务: query_len={len(query)}, selected_ids={selected_ids}")

    res, search_results = await analyze_inspiration_logic(query + extra_instruction, selected_ids=selected_ids)
    structured_items = await extract_semantic_content(res)
    templates = await get_available_templates_metadata()
    follow_up_reply = "是否需要生成小红书信息图片？请选一个模版："
    
    return {
        "final_decision": {**decision,  "reply": res, "follow_up_reply": follow_up_reply, "templates": templates, "results": search_results}, 
        "structured_content": {"items": structured_items},
        "messages": [AIMessage(content=res)]
    }

async def _execute_copy_writer_llm(state: PlannerState, decision: dict):
    from app.agents.workers.copy_writer import generate_copy_writing
    from app.tools.security_check import check_sensitive_words
    
    # 获取需要排版或写入的内容
    structured = state.get("structured_content")
    if structured and structured.get("items"):
        content = json.dumps(structured["items"], ensure_ascii=False)
    else:
        content = decision.get("parameters", {}).get("content") or str(state.get("messages")[-1].content)
        
    res = await generate_copy_writing(content, "")
    is_safe, found_words = await check_sensitive_words(res)
    status_msg = "" if is_safe else f"\n\n⚠️ [检测到敏感词: {', '.join(found_words)}]"
    final_reply = res + status_msg
    
    message_content = json.dumps({
        "thought": decision.get("thought", ""),
        "action": decision.get("action"),
        "reply": final_reply,
        "follow_up_reply": decision.get("follow_up_reply"),
        "templates": decision.get("templates"),
        "results": decision.get("results"),
        "parameters": {**decision.get("parameters", {}), "text_to_check": res}
    }, ensure_ascii=False)
    
    return {
        "final_decision": {**decision, "reply": final_reply},
        "messages": [AIMessage(content=message_content)]
    }

# ---------------- 中枢执行节点 ----------------
async def call_creative_model(state: PlannerState):
    """灵感创意与文案排版中枢节点"""
    decision = state.get("final_decision", {})
    action = decision.get("action")
    
    # 按照 Action 进行专精纯工具或纯大模型拦截执行
    if action == "run_ingest_urls":
        return await _execute_ingest_urls(state, decision)
    if action == "run_xhs_search":
        return await _execute_xhs_search(state, decision)
    if action == "analyze_inspiration":
        return await _execute_analyze_inspiration(state, decision)
    if action in ["run_copy_writing", "summary_draft"]:
        return await _execute_copy_writer_llm(state, decision)
        
    # 如果是不在上述列表里但路由给这里的（如 create_rednote_node），仅需补全参数并保持 action 返回
    return {"final_decision": decision}
