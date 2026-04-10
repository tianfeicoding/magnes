"""
Asset Slicer Agent
物理图层拆解专家。
核心职责是调用 Qwen-Image-Layered 将用户上传的单张图片拆解为原始物理切片资产。
"""
# backend/app/agents/slicer.py
from datetime import datetime
from app.schema.state import MagnesState
from app.core import prompts
from app.tools.visual_analyzer import call_qwen_image_layered

async def slicer_node(state: MagnesState):
    """
    Asset Slicer 节点：物理图层拆解专家。
    职责：调用 Qwen-Image-Layered 将用户上传的单张图片拆解为原始物理切片资产。
    """
    print(f"--- [Asset Slicer] 启动物理分层逻辑 @ {datetime.now()} ---")
    
    intent = state.get("intent", {})
    image_url = intent.get("image_url")
    num_layers = intent.get("num_layers") or 4
    
    if not image_url:
        print("[Asset Slicer] ❌ 错误：未发现图层拆解所需的输入图片 URL")
        return {"current_step": "error_slicer_no_image"}

    # 调用 302.ai 视觉分析工具
    # 使用中央 Prompt 库中的指令
    analyzer_prompt = state.get("user_prompt") or prompts.REGION_DETECTION["main"]
    raw_analysis = await call_qwen_image_layered(image_url, prompt=analyzer_prompt, num_layers=num_layers)
    
    if "error" in raw_analysis:
        return {"current_step": "error_slicer_failed", "error": raw_analysis['error']}
    
    # 获取原始图层资产
    # 302.ai 的返回结构通常在 'images' 或 'layers' 里
    raw_images = raw_analysis.get("layers") or raw_analysis.get("images") or []
    
    # 统一化处理：确保 visual_assets 存储的是 URL 字符串列表，而非字典
    images = []
    for item in raw_images:
        if isinstance(item, str):
            images.append(item)
        elif isinstance(item, dict):
            url = item.get("url") or item.get("image_url")
            if url:
                images.append(url)
    
    print(f"[Asset Slicer] 分层成功，提取到 {len(images)} 个原始物理切片")
    
    return {
        "visual_assets": images,
        "current_step": "slicing_completed",
        "style_evolution": state.get("style_evolution", []),  # [FIX] 保留 style_evolution
        "intent": state.get("intent")  # [FIX] 保留 intent，确保后续节点能获取原图 URL
    }
