"""
AI Painter Agent
底图生成与重绘专家。
根据用户意图进行背景生成，或者利用上游 Slicer 产出的资产进行 I2I 重绘（Nano-Banana 2 / DALL-E 3）。
"""
# backend/app/agents/painter.py
from datetime import datetime
from app.schema.state import MagnesState
from app.core import prompts
from app.tools.painting_tool import call_image_generate
from PIL import Image
import io
import base64
import aiohttp


async def get_image_size(image_url: str) -> tuple[int, int] | None:
    """获取图片尺寸 (width, height)，支持 URL 和 base64"""
    try:
        if image_url.startswith('data:image'):
            # Base64 图片
            _, base64_data = image_url.split(',', 1)
            image_data = base64.b64decode(base64_data)
            img = Image.open(io.BytesIO(image_data))
            return img.size
        elif image_url.startswith('http'):
            # URL 图片 - 只下载前几个字节来获取尺寸
            async with aiohttp.ClientSession() as session:
                async with session.get(image_url) as response:
                    if response.status == 200:
                        data = await response.read()
                        img = Image.open(io.BytesIO(data))
                        return img.size
    except Exception as e:
        print(f"[AI Painter] ⚠️ 获取图片尺寸失败: {e}")
    return None


def get_size_by_aspect_ratio(width: int, height: int) -> str:
    """根据原图比例返回合适的生图尺寸"""
    ratio = width / height

    # 竖图 (Portrait)
    if ratio < 0.8:
        # 3:4 = 0.75, 2:3 = 0.667, 9:16 = 0.5625
        if ratio >= 0.7:  # 3:4 比例 (0.75)
            return "1152x1536"  # 3:4 竖版
        else:  # 2:3 或更窄
            return "1024x1536"  # 2:3 竖版
    # 横图 (Landscape)
    elif ratio > 1.2:
        # 4:3 = 1.333, 3:2 = 1.5, 16:9 = 1.778
        if ratio <= 1.4:  # 4:3 比例
            return "1536x1152"  # 4:3 横版
        else:  # 3:2 或更宽
            return "1536x1024"  # 3:2 横版
    # 方图 (Square) - 比例接近 1:1
    else:
        return "1024x1024"  # 1:1 方版

async def painter_node(state: MagnesState):
    """
    AI Painter 节点：底图生成专家。
    职责：根据用户 prompt 或上游拆解资产利用 Nano-Banana 2 生成/重绘背景图。
    """
    print(f"--- [AI Painter] 启动背景生成/重绘逻辑 @ {datetime.now()} ---")
    
    raw_prompt = state.get("user_prompt") or state.get("instruction") or ""
    visual_assets = state.get("visual_assets") or []
    
    # 资产感知 (I2I 模式)
    # 如果有上游资产（来自 Slicer），则进入重绘模式
    base_image = visual_assets[0] if visual_assets else None
    
    # 兼容处理：如果 base_image 是字典格式 {"url": "..."}
    if isinstance(base_image, dict):
        base_image = base_image.get("url") or base_image.get("image_url")

    if base_image and isinstance(base_image, str):
        print(f"[AI Painter] 🛠 检测到上游资产，进入 I2I 重绘模式. Base: {base_image[:50]}...")
    
    # 优先级逻辑：如果 Style Analyzer 已经反推了风格，则优先使用
    # [NEW] 使用 bilingual 结构的 prompt_text_en (英文提示词) 用于生图
    prompt_text_en = state.get("prompt_text_en")
    prompt_text_zh = state.get("prompt_text_zh")
    refined_style = state.get("style_prompt")  # 兼容旧版

    if prompt_text_en:
        # 优先使用英文提示词生图
        print(f"[AI Painter] 🚀 发现 bilingual 提示词，使用英文版生图...")
        print(f"[AI Painter] 中文提示词 (展示用): {prompt_text_zh[:80]}...")
        print(f"[AI Painter] 英文提示词 (生图用): {prompt_text_en[:80]}...")
        user_prompt = prompt_text_en
    elif refined_style:
        print(f"[AI Painter] 🚀 发现高保真风格 Prompt，正在接管生成逻辑...")
        user_prompt = refined_style
    else:
        # 兼容旧逻辑
        is_slicing_command = any(word in raw_prompt.lower() for word in ["拆分", "图层", "切片", "slic", "layer"])
        if is_slicing_command and not state.get("user_prompt"):
            # 使用后端预定义的建议 Prompt
            user_prompt = prompts.BACKGROUND_GENERATION["styles"]["minimalist"]
        else:
            user_prompt = raw_prompt

    # 使用中央 Prompt 进行质量指令增强 (如果是 AI 生成的 Prompt 则可选择跳过增强，但此处保留统一处理)
    final_prompt = user_prompt.strip()
    if not refined_style:
        # 仅对普通指令进行 reconstruct 增强
        from app.core import prompts
        # 简单封装或直接调用
        quality_suffix = prompts.BACKGROUND_GENERATION["quality_suffix"]
        final_prompt = f"{user_prompt}, {quality_suffix}"


    if not user_prompt and not base_image:
        print("[AI Painter] ⚠️ 警告：既无 Prompt 也无 Base Image，将跳过")
        return {"current_step": "painter_skipped"}

    # [FIX] 获取原图尺寸以保持比例
    image_size = "1024x1024"  # 默认方图
    if base_image:
        img_size = await get_image_size(base_image)
        if img_size:
            width, height = img_size
            print(f"[AI Painter] 📐 原图尺寸: {width}x{height}")
            image_size = get_size_by_aspect_ratio(width, height)
            print(f"[AI Painter] 📐 选择生图尺寸: {image_size} (保持原图比例)")

    print(f"[AI Painter] 正在发起请求 (Model: nano-banana, Size: {image_size})...")

    # 调用生图工具 (使用增强后的 final_prompt 和原图比例尺寸)
    bg_url = await call_image_generate(
        prompt=final_prompt,
        model="nano-banana",
        image_url=base_image,
        size=image_size
    )
    
    if not bg_url:
        print("[AI Painter] ❌ 生成失败，尝试使用 DALL-E 3 备份...")
        bg_url = await call_image_generate(
            prompt=final_prompt,
            model="dall-e-3",
            size=image_size
        )
    
    if not bg_url:
        print("[AI Painter] ❌ 生成失败，记录状态并跳过")
        return {
            "messages": [("ai", "AI 生图服务暂时波动，已跳过背景优化。")],
            "current_step": "painter_failed"
        }
    
    print(f"[AI Painter] 产出成功: {bg_url}")

    # 获取当前演化的版本号
    evolved_version = state.get("evolved_version")
    current_evolution = state.get("style_evolution", [])
    print(f"[AI Painter DEBUG] Input style_evolution: length={len(current_evolution)}, versions={[e.get('version') for e in current_evolution]}")
    style_evolution_update = None

    if evolved_version is not None:
        # 需要更新对应版本的 generated_image
        # 由于 state 是不可变的，我们通过返回一个特殊标记让 workflow 处理
        style_evolution_update = {
            "version_to_update": evolved_version,
            "generated_image": bg_url
        }
        print(f"[AI Painter] 将验证图关联到版本 V{evolved_version}")

    # 获取当前的 evaluation_mode 和 run_style_critic 以便传递
    current_eval_mode = state.get("evaluation_mode", "evolution")
    current_run_style_critic = state.get("run_style_critic", False)

    return {
        "visual_assets": [bg_url],
        "background_url": bg_url,
        "current_step": "painter_completed",
        "style_evolution_update": style_evolution_update,  # 标记需要更新版本
        "evaluation_mode": current_eval_mode,  # 确保评分模式被传递
        "run_style_critic": current_run_style_critic,  # [FIX] 确保验证模式标记被传递
        "style_evolution": state.get("style_evolution", []),  # [FIX] 保留 style_evolution
        "intent": state.get("intent")  # [FIX] 传递 intent，确保 style_critic 可以获取原图 URL
    }
