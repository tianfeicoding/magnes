from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from app.schema.state import MagnesState
from app.tools.slicer import slicer_node
from app.agents.workers.refiner import refiner_node
from app.agents.workers.layout_analyzer import layout_analyzer_node
from app.agents.workers.style_analyzer import style_analyzer_node
from app.agents.workers.style_evolve import style_evolve_node
from app.agents.workers.style_critic import style_critic_node
from app.agents.workers.painter import painter_node
from app.tools.composer import composer_node
from app.tools.reviewer import reviewer_node
from app.agents.knowledge_agent import knowledge_agent_node

async def create_workflow():
    """
    创建并编排 Magnes 的多智能体状态机（重构版本）。
    """
    workflow = StateGraph(MagnesState)

    # 1. 定义节点 (Nodes)
    def init_node(state: MagnesState):
        return {"current_step": "parallel_start"}

    workflow.add_node("init", init_node)
    workflow.add_node("slicer", slicer_node)     # 前置分层
    workflow.add_node("refiner", refiner_node)   # 旧版建模 (DEPRECATED)
    workflow.add_node("layout_analyzer", layout_analyzer_node) # 新版: 排版分析
    workflow.add_node("style_analyzer", style_analyzer_node)   # 新版: 视觉风格分析
    workflow.add_node("style_evolve", style_evolve_node)       # 提示词演化
    workflow.add_node("style_critic", style_critic_node)       # [NEW] 视觉审计 (ReAct)
    workflow.add_node("painter", painter_node)   # 并行支流 B: 生图
    workflow.add_node("composer", composer_node) # 汇合点: 融合
    workflow.add_node("reviewer", reviewer_node) # 审核点
    workflow.add_node("knowledge_agent", knowledge_agent_node) # 知识库问答节点

    # --- NEW: 处理 style_evolution_update，将生成的图片和评分关联到对应版本 ---
    def process_evolution_update_node(state: MagnesState):
        """
        处理 style_evolution_update：将 painter 生成的图片 URL 和 critic_report 关联到对应版本记录
        """
        print(f"[Workflow DEBUG] process_evolution_update_node called")
        print(f"[Workflow DEBUG] State keys: {list(state.keys())}")
        print(f"[Workflow DEBUG] run_style_critic: {state.get('run_style_critic')}")
        print(f"[Workflow DEBUG] style_evolution length: {len(state.get('style_evolution', []))}")

        update_info = state.get("style_evolution_update")
        if not update_info:
            return {}

        version_to_update = update_info.get("version_to_update")
        generated_image = update_info.get("generated_image")

        if version_to_update is None or not generated_image:
            return {}

        # 获取当前的 style_evolution 和 critic_report
        current_evolution = state.get("style_evolution", [])
        critic_report = state.get("critic_report")  # [NEW] 获取评分报告
        print(f"[Workflow DEBUG] current_evolution length: {len(current_evolution)}, versions: {[e.get('version') for e in current_evolution]}")
        print(f"[Workflow DEBUG] critic_report present: {critic_report is not None}")
        updated_evolution = []

        for entry in current_evolution:
            if entry.get("version") == version_to_update:
                # 同时更新 generated_image 和 critic_report
                updated_entry = {**entry, "generated_image": generated_image}
                if critic_report:
                    updated_entry["critic_report"] = critic_report
                    print(f"[Workflow] 已将 V{version_to_update} 的验证图和评分报告关联到 style_evolution")
                else:
                    print(f"[Workflow] 已将 V{version_to_update} 的验证图关联到 style_evolution")
                updated_evolution.append(updated_entry)
            else:
                updated_evolution.append(entry)

        # 返回更新后的 style_evolution（使用 replace 策略，不是 add）
        # 同时传递 visual_assets 和 run_style_critic，确保 style_critic 可以正常工作
        result = {
            "style_evolution": updated_evolution,
            "style_evolution_update": None,  # 清空标记
            "visual_assets": state.get("visual_assets", []),  # 传递 visual_assets
            "run_style_critic": state.get("run_style_critic", False),  # 确保验证模式标记被传递
            "intent": state.get("intent")  # 传递 intent，确保 style_critic 可以获取原图 URL
        }
        print(f"[Workflow DEBUG] process_evolution_update_node returning: style_evolution_len={len(updated_evolution)}, versions={[e.get('version') for e in updated_evolution]}")
        return result

    workflow.add_node("process_evolution_update", process_evolution_update_node)


    # 2. 定义编排逻辑 (Edges & Topology)
    # 路径架构:
    #          /--> slicer --> (optional) painter ---\
    # START --|                                       |--> composer --> reviewer --> END
    #          \--> refiner -------------------------/
    #          \--> style_evolve (纯优化) -----------> END
    #          \--> style_evolve -> painter -> critic -> END (验证模式)

    # FIX: 动态路由函数，根据状态决定走向
    def route_from_init(state: MagnesState):
        """
        初始化后的路由决策：
        - 纯 style_evolve 优化模式（不验证）：直接到 style_evolve -> END
        - 验证模式（style_evolve + painter）：需要 slicer 处理图片
        - 其他任务（refiner/layout_analyzer等）：需要 slicer
        - 知识库问答：直接到 knowledge_agent
        """
        # 检查是否是纯优化模式（只演化提示词，不生图验证）
        is_pure_evolve = (
            state.get("run_style_evolve") and
            not state.get("run_painter") and
            not state.get("run_refiner") and
            not state.get("run_layout_analyzer") and
            not state.get("run_style_analyzer")
        )

        if is_pure_evolve:
            print("[Workflow] ✅ 纯优化模式：直接执行演化，跳过 slicer/composer")
            return "style_evolve_only"

        # 知识库问答直接处理
        if state.get("intent", {}).get("action") == "run_knowledge_agent":
            return "knowledge_agent"

        # 其他情况都需要经过 slicer
        return "needs_slicer"

    workflow.set_entry_point("init")
    workflow.add_conditional_edges(
        "init",
        route_from_init,
        {
            "style_evolve_only": "style_evolve",  # 纯优化直接走演化
            "knowledge_agent": "knowledge_agent",
            "needs_slicer": "slicer"              # 其他情况走 slicer
        }
    )

    # slicer 之后的路由：
    # - 如果需要 style_evolve（验证模式或纯优化模式），先去 style_evolve
    # - 否则：需要 painter 的去 painter，否则去 composer
    def route_after_slicer(state: MagnesState):
        # 验证模式：先执行 style_evolve，再执行 painter
        if state.get("run_style_evolve"):
            print("[Workflow] 检测到 Style Evolve，进入演化节点")
            return "style_evolve"
        if state.get("run_painter"):
            print("[Workflow] 检测到 Painter，进入生图模式")
            return "painter"
        else:
            print("[Workflow] 无生图需求，直接进入汇合")
            return "composer"

    workflow.add_conditional_edges(
        "slicer",
        route_after_slicer,
        {
            "style_evolve": "style_evolve",  # 新增演化路径
            "painter": "painter",
            "composer": "composer"
        }
    )

    # V1.2 FIX: painter 需要根据是否是验证模式决定走向
    # 验证模式：painter -> style_critic
    # 普通模式：painter -> composer
    workflow.add_edge("refiner", "composer")
    workflow.add_edge("layout_analyzer", "composer")
    workflow.add_edge("style_analyzer", "composer")

    # --- 演化节点路由 ---
    def route_after_evolve(state: MagnesState):
        """演化后的路由：验证模式去 Painter 生图，纯优化模式直接结束"""
        if state.get("run_painter"):
            print("[Workflow] 验证模式：进入 Painter 生图")
            return "painter"
        # 纯优化模式直接结束
        print("[Workflow] 纯优化完成")
        return "END"

    workflow.add_conditional_edges(
        "style_evolve",
        route_after_evolve,
        {
            "painter": "painter",
            "END": END
        }
    )

    # Painter 之后先经过 process_evolution_update，再根据条件路由
    workflow.add_edge("painter", "process_evolution_update")

    # 从 process_evolution_update 再路由到 style_critic 或 composer
    def route_after_evolution_update(state: MagnesState):
        """处理完 evolution_update 后，验证模式去 Critic，普通模式去 Composer"""
        run_style_critic = state.get("run_style_critic")
        evaluation_mode = state.get("evaluation_mode")
        style_evolution_len = len(state.get("style_evolution", []))
        print(f"[Workflow DEBUG] route_after_evolution_update: run_style_critic={run_style_critic}, evaluation_mode={evaluation_mode}, style_evolution_len={style_evolution_len}")
        print(f"[Workflow DEBUG] Full state keys: {list(state.keys())}")
        if run_style_critic:
            print("[Workflow] 验证模式：进入 Critic 评分")
            return "style_critic"
        print("[Workflow] 普通模式：进入 Composer 汇合")
        return "composer"

    workflow.add_conditional_edges(
        "process_evolution_update",
        route_after_evolution_update,
        {
            "style_critic": "style_critic",
            "composer": "composer"
        }
    )


    # style_critic 之后直接结束
    workflow.add_edge("style_critic", END)

    workflow.add_edge("knowledge_agent", END)
    workflow.add_edge("composer", "reviewer")
    workflow.add_edge("reviewer", END)

    # 4. 配置内存持久化 (MemorySaver)
    memory = MemorySaver()

    # 5. 编译成可运行的应用
    app = workflow.compile(checkpointer=memory)
    return app

# 导出应用实例供 API 调用
