"""
Vision Refiner Agent
视觉分析专家。
负责对视觉资产进行二次加工，计算 0-1000 归一化坐标，并利用视觉大模型（如 Gemini）反推风格描述语。
"""
# backend/app/agents/refiner.py
from datetime import datetime
from app.schema.state import MagnesState
# 暂假定 transform 工具在 visual_analyzer 中，后续可能需要细化
from app.core import prompts
from app.tools.visual_analyzer import transform_to_magnes_schema, analyze_visual_style, parse_ai_design_protocol

async def refiner_node(state: MagnesState):
    """
    Vision Refiner 节点：视觉分析专家。
    职责：1. 基于原图分析风格。 2. 提取原图中的文字坐标 (置于 layout_schema)。
    """
    print(f"--- [Vision Refiner] 启动并行语义分析与分析 @ {datetime.now()} ---")
    
    # 并行架构下，Refiner 读取的是原始输入图片，而不是 Slicer 的切片
    intent = state.get("intent", {})
    source_image = intent.get("image_url")
    
    if not source_image:
        print("[Vision Refiner] ⚠️ 警告：无输入图片，跳过分析")
        return {"current_step": "refiner_skipped"}

    # 1. 调用视觉大模型进行“原图”风格反推与文字定位
    system_instruction = prompts.TEMPLATE_REFINER["main"]
    
    # 动态注入业务技能规范
    active_skill = state.get("active_skill")
    if active_skill:
        from app.core.skills_loader import loader as skill_loader
        business_instruction = skill_loader.get_skill_instruction(active_skill)
        if business_instruction:
            print(f"[Vision Refiner] 🚀 检测到业务技能 [{active_skill}]，正在注入核心业务约束...")
            system_instruction = f"{system_instruction}\n\n## 🚨 最高业务准则 (来自 Skill: {active_skill})\n{business_instruction}\n\n**请务必优先遵守上述业务准测进行分析与布局。**"

    analysis_res = await analyze_visual_style(
        prompt=system_instruction, 
        image_urls=[source_image] # 直接分析原图
    )

    style_prompt = "" # 纯粹的风格描述 
    if analysis_res["status"] == "success":
        raw_content = analysis_res["content"]
        
        # 提取所有 JSON 块以分离布局与风格
        from app.tools.visual_analyzer import extract_json_blocks_from_md
        blocks = extract_json_blocks_from_md(raw_content)
        
        # Block A (通常是第一个) 是布局
        if blocks:
            ai_layers = parse_ai_design_protocol(raw_content)
            
            # Block B (通常是第二个) 是风格
            if len(blocks) > 1:
                style_block = blocks[1]
                style_prompt = style_block.get("style", {}).get("backgroundPrompt") or \
                               style_block.get("backgroundPrompt") or ""
            
            # 如果没找到 Block B，但 Block A 包含风格（某些模型会混在一起）
            if not style_prompt:
                style_prompt = blocks[0].get("style", {}).get("backgroundPrompt") or ""
        
        # 如果还是没有，则使用全文作为兜底
        style_description = raw_content
        print(f"[Vision Refiner] ✅ AI 视觉分析成功。提取到 {len(ai_layers)} 个图层，风格描述长度: {len(style_prompt)}")
    else:
        error_msg = analysis_res.get("message", "Unknown Error")
        print(f"[Vision Refiner] 🛑 AI 分析失败: {error_msg}")
        style_description = f"AI 分析暂时不可用: {error_msg}。"
        ai_layers = []
    
    # 2. 产出逻辑布局协议 (仅包含文字层和画布定义)
    #  动态比例适配：从 intent 获取原始宽高，同步给 Refiner 的画布定义
    canvas_w = intent.get("width") or 1000
    canvas_h = intent.get("height") or 1333
    
    layout_schema = {
        "canvas": {"width": canvas_w, "height": canvas_h},
        "layers": ai_layers
    }
    
    return {
        "layout_schema": layout_schema,
        "style_learning": style_description,
        "style_prompt": style_prompt, # 精准提取的风格描述
        "current_step": "refiner_completed",
        "intent": state.get("intent")  # [FIX] 保留 intent，确保后续节点能获取原图 URL
    }


# 别名，用于 workflow 导入
layout_analyzer_node = refiner_node
