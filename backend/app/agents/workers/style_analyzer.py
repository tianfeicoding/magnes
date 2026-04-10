"""
Style Analyzer Agent
视觉风格专家。
负责从原图中提取美学基因 (Style Genome) 并生成绘图指令 (Style Learning)。
"""
from datetime import datetime
from app.schema.state import MagnesState
from app.core import prompts
from app.tools.visual_analyzer import analyze_visual_style, extract_json_blocks_from_md

async def style_analyzer_node(state: MagnesState):
    """
    Style Analyzer 节点：负责美学风格反推。
    """
    print(f"--- [Style Analyzer] 启动美学风格分析 @ {datetime.now()} ---")
    
    intent = state.get("intent", {})
    source_image = intent.get("image_url")
    
    if not source_image:
        print("[Style Analyzer] ⚠️ 警告：无输入图片，跳过分析")
        return {"current_step": "style_analyzer_skipped"}

    # 调用风格专有 Prompt
    system_instruction = prompts.STYLE_REFINER["main"]
    
    analysis_res = await analyze_visual_style(
        prompt=system_instruction, 
        image_urls=[source_image]
    )

    style_learning = "" # 描述性
    style_prompt = ""   # 精确提示词 (兼容旧版)
    prompt_text_zh = "" # 中文提示词 (给用户看)
    prompt_text_en = "" # 英文提示词 (给生图模型用)
    style_genome = {}   # 结构化基因
    background_color = "#FFFFFF"
    macro_type = ""      # 大分类

    if analysis_res["status"] == "success":
        raw_content = analysis_res["content"]
        style_learning = raw_content # 全文作为学习材料

        # 提取结构化数据
        blocks = extract_json_blocks_from_md(raw_content)
        if blocks:
            # 查找 style 块
            for block in blocks:
                s_data = block.get("style", block) # 兼容不同输出格式
                # [NEW] 优先解析 bilingual 结构: prompt_text.zh / prompt_text.en
                prompt_text = s_data.get("prompt_text", {})
                if prompt_text and (prompt_text.get("zh") or prompt_text.get("en")):
                    prompt_text_zh = prompt_text.get("zh", "")
                    prompt_text_en = prompt_text.get("en", "")
                    style_prompt = prompt_text_zh  # 兼容旧版：中文用于展示
                    style_genome = s_data.get("genome", {})
                    background_color = s_data.get("backgroundColor", background_color)
                    macro_type = s_data.get("macro_type", "")
                    break
                # [兼容旧版] 兜底：解析 backgroundPrompt
                elif "backgroundPrompt" in s_data:
                    style_prompt = s_data["backgroundPrompt"]
                    prompt_text_zh = style_prompt
                    prompt_text_en = style_prompt
                    style_genome = s_data.get("genome", {})
                    background_color = s_data.get("backgroundColor", background_color)
                    macro_type = s_data.get("macro_type", "")
                    break

        print(f"[Style Analyzer] ✅ 风格分析完成。基因维度: {len(style_genome)}, 中文提示词: {len(prompt_text_zh)}字, 英文提示词: {len(prompt_text_en)}字")
    else:
        print(f"[Style Analyzer] 🛑 分析失败: {analysis_res.get('message')}")
        style_learning = f"风格分析暂时不可用: {analysis_res.get('message')}"
    
    # 创建初始版本记录（V0 - 原始提取）
    initial_evolution = [{
        "version": 0,
        "strategy": "extract",
        "prompt": style_prompt,  # 兼容旧版
        "prompt_text": {  # [NEW] bilingual 结构
            "zh": prompt_text_zh or style_prompt,
            "en": prompt_text_en or style_prompt
        },
        "timestamp": datetime.now().isoformat(),
        "parent_version": -1,
        "critique": "从参考图提取的原始提示词",
        "changes": ["原始提取"],
        "source_image": source_image  # 保存原图URL
    }] if (style_prompt or prompt_text_zh) else []

    return {
        "style_learning": style_learning,
        "style_prompt": style_prompt,  # 兼容旧版：中文提示词
        "prompt_text_zh": prompt_text_zh,  # [NEW] 中文提示词（给用户看）
        "prompt_text_en": prompt_text_en,  # [NEW] 英文提示词（给生图模型用）
        "style_genome": style_genome,
        "background_color": background_color,
        "macro_type": macro_type,
        "style_evolution": initial_evolution,  # 初始版本历史（包含 bilingual 结构）
        "current_step": "style_analyzer_completed",
        "intent": state.get("intent")  # [FIX] 保留 intent，确保后续节点能获取原图 URL
    }
