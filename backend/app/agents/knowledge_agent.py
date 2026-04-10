"""
Knowledge Agent Node
专门负责处理基于品牌知识库的对话问答。
集成 LlamaIndex 检索流与聊天历史感知能力。
"""
# backend/app/agents/knowledge_agent.py
from typing import List, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from app.schema.state import MagnesState
from app.core import prompts, llm_config
from app.rag.retrieval.workflow import run_style_retrieval

def format_chat_history(messages: List[BaseMessage]) -> str:
    """将消息列表格式化为文本，以便注入 Prompt"""
    history_lines = []
    for msg in messages:
        role = "用户" if isinstance(msg, HumanMessage) else "助手"
        content = str(msg.content)
        # 简单过滤，避免把过长的历史全部塞进去
        history_lines.append(f"{role}: {content[:200]}")
    return "\n".join(history_lines[-6:]) # 只取最近 6 轮对话

async def knowledge_agent_node(state: MagnesState):
    """
    Knowledge Agent 节点：回答 RAG 相关问题。
    """
    print(f"--- [Knowledge Agent] 开始处理问答请求 ---")
    
    # 1. 获取最新问题
    query = state.get("instruction") or ""
    if not query and state.get("messages"):
        last_msg = state["messages"][-1]
        if isinstance(last_msg, HumanMessage):
            query = str(last_msg.content)

    # 2. 触发检索：调用 LlamaIndex Workflow
    # 这里我们检索 knowledge_base 集合，获取品牌相关的业务知识
    print(f"[Knowledge Agent] 🔍 正在检索知识库: {query[:50]}...")
    search_results = await run_style_retrieval(
        query=query, 
        collection="knowledge_base",
        top_k=5
    )
    
    # 3. 组装上下文块
    results = search_results.get("results", []) if isinstance(search_results, dict) else []
    context_blocks = []
    for i, res in enumerate(results):
        # 兼容性处理：优先取 visual_description (Workflow 默认字段)，其次取 text
        content = res.get("visual_description") or res.get("text") or ""
        context_blocks.append(f"资料[{i+1}]: {content}")
    context_str = "\n\n".join(context_blocks) if context_blocks else "（未找到相关背景知识）"

    # 4. 格式化聊天历史
    history_str = format_chat_history(state.get("messages", []))

    # 5. 调用 LLM 生成回答
    from app.rag import config
    base_url, api_key = await llm_config.get_llm_config()
    model_name = config.DEFAULT_KNOWLEDGE_MODEL 
    
    # --- 诊断日志 ---
    print(f"[KnowledgeAgent] 使用模型: {model_name}", flush=True)

    llm = ChatOpenAI(
        model=model_name, 
        api_key=api_key,
        base_url=base_url,
        temperature=0.2,
        streaming=True # 开启流式输出，配合前端实现“打字机”效果
    )
    
    # 填充提示词
    sys_prompt = prompts.KNOWLEDGE_QA["system"]
    user_prompt = prompts.KNOWLEDGE_QA["user"].format(
        context=context_str,
        history=history_str,
        query=query
    )
    
    print(f"[Knowledge Agent] 🤖 正在生成回答...")
    full_response = ""
    async for chunk in llm.astream([
        SystemMessage(content=sys_prompt),
        HumanMessage(content=user_prompt)
    ]):
        full_response += chunk.content
    
    # 6. 返回状态更新
    # 按照星型专家架构要求，必须返回 final_decision 字段，handle_stream_events 才能识别为 reply
    final_decision = {
        "thought": f"基于品牌知识库回答：{query[:20]}...",
        "action": "chat",
        "reply": full_response
    }

    return {
        "messages": [AIMessage(content=full_response)],
        "final_decision": final_decision,
        "current_step": "knowledge_answered"
    }
