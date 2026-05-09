"""
Planner 图定义 (Star Topology Multi-Agent Refactored)
使用 LangGraph 构建任务编排图。
通过 Supervisor (planner_agent) 将意图快速分发给四大独立专家 (designer, creative, knowledge, security)，实现最纯粹的星型并发架构。
"""
import os
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from .state import PlannerState
from .router import call_model
from .summarizer import summarize_conversation
from .routing import route_decision

# 导入星型专家节点
from app.agents.designer_agent import call_designer_model
from app.agents.creative_agent import call_creative_model
from app.agents.knowledge_agent import knowledge_agent_node
from .executor import executor_agent
from app.tools.security_check import check_sensitive_words  # 依然可用作独立工具暴露

# 单例图实例
planner_graph = None
_memory_context = None

async def init_planner_graph():
    """初始化并编译 LangGraph"""
    global planner_graph, _memory_context
    
    if planner_graph is not None:
        return planner_graph, _memory_context
        
    print("[Planner Graph] 🏗️ 正在执行首次图初始化 (星型多智能体版)...", flush=True)
    
    workflow = StateGraph(PlannerState)
    
    # ======== 1. 注册核心中枢与专家节点 ========
    workflow.add_node("planner_agent", call_model) # Supervisor 中枢
    workflow.add_node("designer_agent", call_designer_model)
    workflow.add_node("creative_agent", call_creative_model)
    workflow.add_node("knowledge_agent", knowledge_agent_node)
    workflow.add_node("executor_agent", executor_agent)
    workflow.add_node("summarizer", summarize_conversation)

    # 保留一层安全的后置审核节点，用于接收来自纯文本通道或者兜底的安全需求
    async def security_check_node(state: PlannerState):
        decision = state.get("final_decision", {})
        text = decision.get("reply", "")
        if not text:
            return {"final_decision": decision}
        is_safe, found_words = await check_sensitive_words(text)
        if not is_safe:
            status_msg = f"\n\n⚠️ [检测到敏感词: {', '.join(found_words)}]"
            decision["reply"] = text + status_msg
        return {"final_decision": decision}
        
    workflow.add_node("security_check", security_check_node)
    
    # ======== 2. 编排星型路由边 ========
    # 起点直达路由中枢
    workflow.add_edge(START, "planner_agent")
    
    # Supervisor 依据 route_decision 扇出
    workflow.add_conditional_edges("planner_agent", route_decision, {
        "designer_agent": "designer_agent",
        "creative_agent": "creative_agent",
        "knowledge_agent": "knowledge_agent",
        "security_check": "security_check",
        "summarizer": "summarizer",
        "end": END
    })
    
    # 专家节点全部收束至执行器进行可能的物理工具调用
    workflow.add_edge("designer_agent", "executor_agent")
    workflow.add_edge("creative_agent", "executor_agent")
    workflow.add_edge("knowledge_agent", "executor_agent")
    workflow.add_edge("security_check", "executor_agent")
    
    # 最终汇总
    workflow.add_edge("executor_agent", "summarizer")
    
    workflow.add_edge("summarizer", END)
    
    # ======== 3. 持久化配置 ========
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "data"))
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "planner_checkpoints.db")
    
    _memory_context = AsyncSqliteSaver.from_conn_string(db_path)
    memory = await _memory_context.__aenter__()
    
    planner_graph = workflow.compile(checkpointer=memory)
    print("✅ Planner Graph (Multi-Agent Star Topology) 已就绪", flush=True)
    
    return planner_graph, _memory_context
