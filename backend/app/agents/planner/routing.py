"""
Planner 路由逻辑
定义 LangGraph 中的条件边跳转逻辑，根据 LLM 的决策结果分发到不同的业务节点。
"""
from .state import PlannerState

def route_decision(state: PlannerState):
    """LangGraph 路由逻辑 (基于新 Supervisor 架构的星型分发)"""
    decision = state.get("final_decision") or {}
    action = decision.get("action")
    print(f"[Planner Routing] 星型枢纽接收状态: Action={action}")
    
    if action == "run_knowledge_agent":
        return "knowledge_agent"
    elif action in ["route_to_designer", "run_painter", "mirror_image", "export_canvas_image", "optimize_prompt", "save_prompt"]:
        return "designer_agent"
    elif action in ["run_copy_writing", "summary_draft", "analyze_inspiration", "run_xhs_search", "run_xhs_publish", "create_rednote_node", "run_ingest_urls"]:
        return "creative_agent"
    elif action == "run_security_check":
        return "security_check"
    
    if decision.get("is_fast_path"):
         return "end"
    
    return "summarizer"
