"""
Style Critic Agent
视觉审计专家。
负责对演化过程中产生的预览图进行审美评估，并产出反馈建议。
支持两种评分模式：还原模式(clone) 和 创作模式(evolution)
"""
from datetime import datetime
from app.schema.state import MagnesState
from app.agents.workers.visual_critic import critic_manager


async def style_critic_node(state: MagnesState):
    """
    Style Critic 节点：负责对生成结果进行视觉审计。
    """
    print(f"--- [Style Critic] 启动视觉审计 @ {datetime.now()} ---")

    # 1. 获取最近生成的预览图
    visual_assets = state.get("visual_assets", [])
    if not visual_assets:
        print("[Style Critic] 警告：无预览图，跳过审计")
        return {"current_step": "style_critic_skipped"}

    latest_image = visual_assets[-1]  # 获取最新生成的图
    target_prompt = state.get("style_prompt", "")
    intent = state.get("intent", {})
    # [DEBUG] 打印 intent 内容（截断图片字段）
    intent_log = dict(intent) if intent else {}
    if intent_log.get("image_url"):
        img_str = str(intent_log["image_url"])
        if len(img_str) > 100:
            intent_log["image_url"] = f"{img_str[:50]}...[truncated {len(img_str)-100} chars]...{img_str[-50:]}"
    print(f"[Style Critic DEBUG] intent: {intent_log}")
    print(f"[Style Critic DEBUG] intent type: {type(intent)}")
    ref_image = intent.get("image_url")  # 参考原图
    # 截断打印，避免输出完整的base64图片
    ref_image_log = ref_image[:50] + "..." if ref_image and len(ref_image) > 50 else ref_image
    print(f"[Style Critic DEBUG] ref_image from intent: {ref_image_log}")

    # 如果 intent 中没有 image_url，尝试从 style_evolution V0 获取
    if not ref_image:
        style_evolution = state.get("style_evolution", [])
        print(f"[Style Critic DEBUG] Trying style_evolution, length: {len(style_evolution)}")
        if style_evolution:
            v0_entry = style_evolution[0]  # V0 版本
            ref_image = v0_entry.get("source_image")
            # 截断打印，避免输出完整的base64图片
            ref_image_log = ref_image[:50] + "..." if ref_image and len(ref_image) > 50 else ref_image
            print(f"[Style Critic DEBUG] ref_image from V0: {ref_image_log}")

    macro_type = state.get("macro_type") or "未知分类"

    # 获取评分模式（从 state 的 evaluation_mode 字段读取，默认 evolution）
    evaluation_mode = state.get("evaluation_mode", "evolution")

    # 2. 调用 VisualCritic 进行深度对比分析
    report = await critic_manager.audit_image(
        image_url=latest_image,
        prompt=target_prompt,
        ref_image_url=ref_image,
        macro_type=macro_type,
        evaluation_mode=evaluation_mode
    )

    score = report.get("score", 0)
    suggestion = report.get("improvement_suggestion", "")
    mode = report.get("evaluation_mode", evaluation_mode)

    mode_label = "还原度" if mode == "clone" else "创作质量"
    print(f"[Style Critic] 审计完成。评分模式: {mode_label}, 分数: {score}")
    print(f"[Style Critic] 完整报告: {report}")

    # [DEBUG] 检查返回的 style_evolution
    evolution_to_return = state.get("style_evolution", [])
    print(f"[Style Critic DEBUG] Returning style_evolution: length={len(evolution_to_return)}, versions={[e.get('version') for e in evolution_to_return]}")

    return {
        "critic_report": report,
        "current_step": "style_critic_completed",
        "evolution_count": 1,  # 触发计数器自增
        "evaluation_mode": evaluation_mode,  # 确保评分模式被传递
        "style_evolution": evolution_to_return  # 保留 style_evolution
    }
