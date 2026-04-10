"""
Visual Critic Worker
负责对 AI 生成的图片进行质量评估与意图对齐分析。
支持两种评分模式：还原模式(clone) 和 创作模式(evolution)
"""
import json
import base64
from typing import Dict, Any, Optional
from app.core.prompts import (
    CRITIC_PROMPT_BASE,
    CLONE_CRITERIA,
    EVOLUTION_CRITERIA
)
from app.tools.visual_analyzer import analyze_visual_style


def _compress_image_if_needed(image_data: bytes, max_size: tuple = (512, 512), quality: int = 60) -> tuple:
    """
    压缩图片以降低base64大小。
    返回: (压缩后的图片数据, 图片格式)
    """
    try:
        from PIL import Image
        from io import BytesIO

        img = Image.open(BytesIO(image_data))
        original_size = len(image_data)
        original_mode = img.mode

        # 转换为RGB（去除alpha通道，减少大小）
        if original_mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # 如果图片尺寸过大，进行缩放
        if img.width > max_size[0] or img.height > max_size[1]:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            print(f"[VisualCritic] 图片尺寸过大，已缩放至: {img.width}x{img.height}")

        # 保存为JPEG（通常比PNG小）
        output = BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        compressed_data = output.getvalue()
        compressed_size = len(compressed_data)

        # 如果压缩后更小，使用压缩版本
        if compressed_size < original_size:
            print(f"[VisualCritic] 图片已压缩: {original_size/1024:.1f}KB -> {compressed_size/1024:.1f}KB")
            return compressed_data, 'jpeg'
        else:
            # 压缩后反而更大，返回原始数据
            return image_data, img.format.lower() if img.format else 'jpeg'

    except Exception as e:
        print(f"[VisualCritic] 图片压缩失败: {e}, 使用原始数据")
        return image_data, 'jpeg'


def _convert_image_to_base64(image_url: str, max_size_bytes: int = 150000) -> str:
    """
    将图片URL转换为base64格式，并进行压缩以控制token数量。
    如果已经是base64格式，解码后压缩再返回。
    如果是http URL，尝试下载并转为base64。

    Args:
        image_url: 图片URL或base64字符串
        max_size_bytes: 最大base64大小（默认150KB，约200KB原始数据）
    """
    image_data = None
    ext = "jpeg"

    # 如果已经是base64格式，解码后处理
    if image_url and image_url.startswith("data:image"):
        try:
            # 提取base64部分
            base64_part = image_url.split(",")[-1] if "," in image_url else image_url
            image_data = base64.b64decode(base64_part)
            # 检测格式
            if "png" in image_url:
                ext = "png"
            elif "webp" in image_url:
                ext = "webp"
            else:
                ext = "jpeg"
            print(f"[VisualCritic] 输入为base64，已解码: {len(image_data)} bytes")
        except Exception as e:
            print(f"[VisualCritic] base64解码失败: {e}, 返回原URL")
            return image_url

    # 如果是本地文件路径
    elif image_url and image_url.startswith("/"):
        try:
            with open(image_url, "rb") as f:
                image_data = f.read()
            # 检测文件类型
            ext = image_url.split(".")[-1].lower() if "." in image_url else "jpeg"
            if ext == "jpg":
                ext = "jpeg"
        except Exception as e:
            print(f"[VisualCritic] 本地文件读取失败: {e}")
            return image_url

    # 如果是http(s) URL，尝试下载
    elif image_url and (image_url.startswith("http://") or image_url.startswith("https://")):
        try:
            import httpx
            response = httpx.get(image_url, timeout=30.0)
            response.raise_for_status()
            image_data = response.content
            # 检测内容类型
            content_type = response.headers.get("content-type", "image/jpeg")
            if "png" in content_type:
                ext = "png"
            elif "webp" in content_type:
                ext = "webp"
            else:
                ext = "jpeg"
            print(f"[VisualCritic] 已下载图片: {len(image_data)} bytes")
        except Exception as e:
            print(f"[VisualCritic] 下载图片失败: {e}, 返回原URL")
            return image_url

    if not image_data:
        return image_url

    # 检查是否需要压缩
    if len(image_data) > max_size_bytes:
        print(f"[VisualCritic] 图片过大({len(image_data)/1024:.1f}KB)，进行压缩...")
        image_data, ext = _compress_image_if_needed(image_data)

    # 转换为base64
    base64_data = base64.b64encode(image_data).decode()
    print(f"[VisualCritic] 已转为base64: {len(base64_data)} chars ({len(base64_data)*0.75/1024:.1f}KB)")
    return f"data:image/{ext};base64,{base64_data}"


def _get_mode_description(evaluation_mode: str) -> str:
    """获取评分模式的描述"""
    descriptions = {
        "clone": "本次评分关注【还原度】：评估生成图与参考原图的相似程度，越接近原图分数越高。",
        "evolution": "本次评分关注【风格演化】：评估生成图是否延续参考图风格，同时体现创意变化。"
    }
    return descriptions.get(evaluation_mode, descriptions["evolution"])


def _get_macro_type_criteria(macro_type: str, evaluation_mode: str) -> str:
    """根据分类和评分模式获取风格标准"""
    base_criteria = {
        "平面设计": {
            "clone": "检查布局结构、色彩值、材质纹理（如手撕纸边、涂鸦感）是否与原图一致。",
            "evolution": "检查是否保留了平面设计的排版逻辑、色彩平衡、边缘质感等风格基因。"
        },
        "摄影作品": {
            "clone": "检查光影位置、强度、色温，以及透视关系是否与原图一致。",
            "evolution": "检查是否延续了摄影作品的光影表现、空间透视、材质真实感等风格特点。"
        }
    }

    default_criteria = {
        "clone": "检查整体视觉效果、色彩、构图是否与原图一致。",
        "evolution": "检查风格对齐度、美学质量、创意合理性。"
    }

    return base_criteria.get(macro_type, default_criteria).get(evaluation_mode, default_criteria[evaluation_mode])


async def run_visual_critic(
    image_url: str,
    target_prompt: str,
    ref_image_url: Optional[str] = None,
    macro_type: str = "未知分类",
    evaluation_mode: str = "evolution"  # "clone" | "evolution"
) -> Dict[str, Any]:
    """
    执行视觉评估任务。

    Args:
        image_url: 待评估的生成图 URL
        target_prompt: 生成该图使用的提示词
        ref_image_url: 参考原图 URL（可选）
        macro_type: 宏观分类（平面设计/摄影作品）
        evaluation_mode: 评分模式
            - "clone": 还原模式，评估与原图的相似度
            - "evolution": 创作模式，评估风格传承和创意质量
    """
    # [FIX] 截断 ref_image_url，避免将完整base64放入prompt
    if ref_image_url:
        url_log = ref_image_url[:50] + "..." if len(ref_image_url) > 50 else ref_image_url
        ref_context = f"参考原图已提供: {url_log}"
    else:
        ref_context = "未提供参考原图。"

    # 根据评分模式选择对应的评分标准
    if evaluation_mode == "clone":
        specific_criteria = CLONE_CRITERIA + "\n\n" + _get_macro_type_criteria(macro_type, "clone")
        mode_description = _get_mode_description("clone")
    else:
        specific_criteria = EVOLUTION_CRITERIA + "\n\n" + _get_macro_type_criteria(macro_type, "evolution")
        mode_description = _get_mode_description("evolution")

    # 构建完整的 prompt
    prompt = CRITIC_PROMPT_BASE.format(
        macro_type=macro_type,
        evaluation_mode_description=mode_description,
        prompt=target_prompt,
        ref_context=ref_context,
        specific_criteria=specific_criteria
    )

    print(f"[VisualCritic] [Vision] 评分模式: {evaluation_mode}, 分类: {macro_type}")

    # [DEBUG] 检查传入的图片 URL
    image_urls = [image_url] + ([ref_image_url] if ref_image_url else [])
    print(f"[VisualCritic] 传入的图片URLs: {len(image_urls)} 张")
    for i, url in enumerate(image_urls):
        url_preview = url[:50] + "..." if url and len(url) > 50 else url
        print(f"  - 图{i+1}: {url_preview}")

    # [FIX] 将图片转为base64格式，避免API无法下载图片的问题
    print(f"[VisualCritic] 正在将图片转为base64格式...")
    base64_urls = []
    for i, url in enumerate(image_urls):
        converted = _convert_image_to_base64(url)
        base64_urls.append(converted)
        if converted != url:
            print(f"  - 图{i+1}: 已转为base64 ({len(converted)} chars)")
        else:
            print(f"  - 图{i+1}: 无需转换或转换失败")

    # 调用视觉分析工具
    result = await analyze_visual_style(
        prompt=prompt,
        image_urls=base64_urls
    )

    if result.get("status") == "success":
        content = result.get("content", "")
        print(f"[VisualCritic] 分析成功，原始内容: {content[:200]}...")
        # 提取 JSON
        try:
            from app.tools.visual_analyzer import extract_json_from_md
            data = extract_json_from_md(content)
            # [FIX] 截断打印，避免输出过长
            data_log = str(data)[:300] + "..." if data and len(str(data)) > 300 else data
            print(f"[VisualCritic] JSON提取结果: {data_log}")
            if data:
                # 注入评分模式信息
                data["evaluation_mode"] = evaluation_mode
                print(f"[VisualCritic] 返回评分: {data.get('score')}, 模式: {evaluation_mode}")
                return data
            else:
                print(f"[VisualCritic] 警告: 未能从内容中提取JSON")
        except Exception as e:
            print(f"[VisualCritic] JSON解析失败: {e}")
            print(f"[VisualCritic] 原始内容: {content[:500]}")
            pass

    print(f"[VisualCritic] 分析失败，status: {result.get('status')}, message: {result.get('message')}")
    return {
        "score": 0,
        "judgement": "Critical analysis failed or timed out.",
        "improvement_suggestion": "Try regenerating with more descriptive words.",
        "can_auto_fix": False,
        "evaluation_mode": evaluation_mode
    }


class VisualCritic:
    """视觉评估管理类"""
    async def audit_image(
        self,
        image_url: str,
        prompt: str,
        ref_image_url: Optional[str] = None,
        macro_type: str = "未知分类",
        evaluation_mode: str = "evolution"
    ):
        """执行图像审计"""
        return await run_visual_critic(
            image_url,
            prompt,
            ref_image_url,
            macro_type,
            evaluation_mode
        )


# 导出全局实例供 task_routes 使用
critic_manager = VisualCritic()
