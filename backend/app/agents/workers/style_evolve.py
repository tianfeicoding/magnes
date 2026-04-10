"""
Style Evolve Agent
基于策略的提示词演化专家。
"""
import json
import re
from datetime import datetime
from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.schema.state import MagnesState
from app.core import prompts, llm_config

def _extract_json_from_text(text: str) -> Dict[str, Any]:
    """从文本中提取 JSON 对象"""
    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试提取 ```json 代码块
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # 尝试提取 {...} 结构
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    return {}

async def style_evolve_node(state: MagnesState):
    """
    Style Evolve 节点：负责提示词的迭代演化与版本管理。
    """
    print(f"--- [Style Evolve] 启动提示词演化 @ {datetime.now()} ---")

    intent = state.get("intent", {})
    strategy = intent.get("evolution_strategy", "evolve") # 策略类型
    current_prompt = state.get("style_prompt") or ""
    target_style = intent.get("target_style", "") # 仅用于 append 策略
    macro_type = state.get("macro_type") or "未知分类"
    is_validation_mode = state.get("run_painter", False)  # 是否是验证模式

    # 动态角色定义
    role_name = "电影灯光师与环境专家" if macro_type == "摄影作品" else "高级视觉传达与材质专家"

    # 1. 获取对应的演化模板
    evolve_templates = prompts.STYLE_EVOLUTION
    critic_report = state.get("critic_report")
    feedback = critic_report.get("improvement_suggestion") if critic_report else None

    if feedback and strategy == "evolve":
        print(f"[Style Evolve] 检测到视觉反馈，正在执行定向自修正演化...")
        template = evolve_templates["evolve_with_feedback"]
        full_prompt = template.format(
            current_prompt=current_prompt,
            feedback=feedback,
            macro_type=macro_type
        )
    else:
        template = evolve_templates.get(strategy, evolve_templates["evolve"])
        full_prompt = template.format(
            current_prompt=current_prompt,
            target_style=target_style,
            macro_type=macro_type,
            role_name=role_name
        )

    # 2. 调用 LLM 进行演化
    base_url, api_key = await llm_config.get_llm_config()
    model_name = "gpt-4o" # 使用强模型进行美学进化

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.7
    )

    response = await llm.ainvoke([HumanMessage(content=full_prompt)])
    response_text = response.content.strip()

    # 3. 解析响应（支持 JSON 格式或纯文本）
    parsed_data = _extract_json_from_text(response_text)

    # 提取 bilingual 提示词 (prompt_text.zh / prompt_text.en)
    prompt_text = parsed_data.get("prompt_text", {})
    new_prompt_zh = prompt_text.get("zh", "").strip()
    new_prompt_en = prompt_text.get("en", "").strip()

    # 兜底：兼容旧版 optimized_prompt 字段
    if not new_prompt_zh:
        new_prompt_zh = parsed_data.get("optimized_prompt", "").strip()
    if not new_prompt_en:
        new_prompt_en = new_prompt_zh  # 如果没有英文，先用中文兜底

    # 如果 JSON 解析完全失败，使用原始响应
    if not new_prompt_zh:
        new_prompt_zh = response_text
        new_prompt_en = response_text

    # 用于兼容的 style_prompt (使用中文)
    new_prompt = new_prompt_zh

    # 提取评价信息（验证模式才需要）
    critique = parsed_data.get("critique", parsed_data.get("corrections", ""))
    if isinstance(critique, list):
        critique = ", ".join(critique)
    changes = parsed_data.get("changes", parsed_data.get("corrections", []))
    if isinstance(changes, str):
        changes = [changes] if changes else []

    # 4. 构造演化记录
    existing_evolution = state.get("style_evolution", [])

    # [FIX] 如果没有 V0，自动创建（从原图提取的初始版本）
    if not existing_evolution:
        print("[Style Evolve] 未检测到版本历史，自动创建 V0（原始提取）")
        # [FIX] 优先从 intent 获取原图 URL，其次从 visual_assets 获取
        source_image = intent.get("image_url")
        if not source_image and state.get("visual_assets"):
            source_image = state.get("visual_assets", [])[0]
        # 截断打印，避免输出完整的base64图片
        source_image_log = source_image[:50] + "..." if source_image and len(source_image) > 50 else source_image
        print(f"[Style Evolve DEBUG] V0 source_image: {source_image_log}")
        v0_entry = {
            "version": 0,
            "strategy": "extract",
            "prompt": current_prompt,  # 兼容旧版：使用当前提示词作为 V0
            "prompt_text": {  # [NEW] bilingual 结构
                "zh": current_prompt,
                "en": current_prompt  # V0 暂时没有英文版，用中文兜底
            },
            "timestamp": datetime.now().isoformat(),
            "parent_version": -1,
            "critique": "从参考图提取的原始提示词",
            "changes": ["原始提取"],
            "source_image": source_image,
            "generated_image": None  # V0是原图，没有生成图
        }
        existing_evolution = [v0_entry]
        print(f"[Style Evolve] 已创建 V0: {current_prompt[:50]}...")

    print(f"[Style Evolve] 接收到的现有版本历史: {len(existing_evolution)} 条")
    print(f"[Style Evolve] 现有版本: {[e.get('version') for e in existing_evolution]}")
    new_version = len(existing_evolution)

    # 获取原图URL（从intent或现有版本）
    source_image = intent.get("image_url")
    if not source_image and existing_evolution:
        # 从V0版本获取原图
        source_image = existing_evolution[0].get("source_image")

    # [NEW] 计算是否为历史最佳版本
    is_best_version = False
    if is_validation_mode and critic_report:
        current_score = critic_report.get("score", 0)
        # 检查是否比之前所有版本的分数都高
        previous_best_score = max(
            [e.get("critic_report", {}).get("score", 0) for e in existing_evolution if e.get("critic_report")],
            default=0
        )
        is_best_version = current_score > previous_best_score
        if is_best_version:
            print(f"[Style Evolve] 🏆 新版本 V{new_version} 是历史最佳！分数: {current_score} > {previous_best_score}")

    evolution_entry = {
        "version": new_version,
        "strategy": strategy,
        "prompt": new_prompt,  # 兼容旧版：中文提示词
        "prompt_text": {  # [NEW] bilingual 结构
            "zh": new_prompt_zh,
            "en": new_prompt_en
        },
        "timestamp": datetime.now().isoformat(),
        "parent_version": new_version - 1 if new_version > 0 else -1,
        # 保存原图信息
        "source_image": source_image,
        # 验证模式额外信息
        "critique": critique if is_validation_mode else (f"使用{strategy}策略优化" if strategy != "extract" else None),
        "changes": changes if is_validation_mode else ([strategy] if strategy != "extract" else None),
        # [NEW] 保存完整的评分报告，用于后续"再优化"参考
        "critic_report": critic_report if is_validation_mode else None,
        # [NEW] 标记是否为历史最佳版本
        "is_best_version": is_best_version,
        # 占位：验证图将在painter生成后填充
        "generated_image": None,
    }

    print(f"[Style Evolve] 演化完成 (Strategy: {strategy})。版本: V{new_version}")
    if is_validation_mode and critique:
        print(f"[Style Evolve] 评价: {critique[:80]}...")

    # 获取当前的 evaluation_mode 和 run_style_critic 以便传递
    current_eval_mode = state.get("evaluation_mode", "evolution")
    current_run_style_critic = state.get("run_style_critic", False)

    # [FIX] 返回完整的演化历史（包括 V0 和新创建的 V1）
    final_evolution = existing_evolution + [evolution_entry]
    print(f"[Style Evolve] 返回完整版本历史: {len(final_evolution)} 条, 版本: {[e.get('version') for e in final_evolution]}")

    return {
        "style_prompt": new_prompt,  # 兼容旧版：中文提示词
        "prompt_text_zh": new_prompt_zh,  # 中文提示词（给用户看）
        "prompt_text_en": new_prompt_en,  # 英文提示词（给生图模型）
        "style_evolution": final_evolution,  # [FIX] 返回完整的演化历史（V0 + V1 + ...）
        "current_step": "style_evolve_completed",
        "evolved_version": new_version,  # 记录当前版本号，供painter使用
        "evaluation_mode": current_eval_mode,  # 确保评分模式被传递
        "run_style_critic": current_run_style_critic,  # [FIX] 确保验证模式标记被传递
        "intent": state.get("intent")  # [FIX] 传递 intent，确保后续节点可以获取原图 URL
    }
