"""
Segment Expert - 图像分割与遮罩合成
支持自动抠图（rembg / 颜色阈值）和手动 mask 合成
"""
import io
import base64
import json
import re
import numpy as np
from PIL import Image, ImageChops, ImageFilter, ImageDraw
from typing import Optional, Tuple, List
import aiohttp
import httpx

# 尝试导入 rembg，如未安装则降级为颜色阈值方案
try:
    from rembg import remove
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False


async def _download_image(url: str) -> Image.Image:
    """异步下载图片并转为 PIL Image"""
    if url.startswith("data:image"):
        # Base64 内嵌图片
        header, encoded = url.split(",", 1)
        data = base64.b64decode(encoded)
        return Image.open(io.BytesIO(data)).convert("RGBA")

    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            data = await resp.read()
            return Image.open(io.BytesIO(data)).convert("RGBA")


def _image_to_base64(img: Image.Image, fmt: str = "PNG") -> str:
    """PIL Image 转 base64 data URL"""
    buffer = io.BytesIO()
    img.save(buffer, format=fmt)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64,{b64}"


def _remove_background_pillow(img: Image.Image) -> Image.Image:
    """
    基于颜色阈值的简单背景去除（降级方案）
    适用于纯色背景（白底/黑底）的商品图
    """
    # 转为 RGBA
    img = img.convert("RGBA")
    data = np.array(img)

    # 检测背景色（取四个角点的众数）
    corners = [
        data[0, 0, :3],
        data[0, -1, :3],
        data[-1, 0, :3],
        data[-1, -1, :3],
    ]
    bg_color = np.median(corners, axis=0).astype(int)

    # 计算每个像素与背景色的距离
    rgb = data[:, :, :3]
    diff = np.linalg.norm(rgb.astype(float) - bg_color, axis=2)

    # 距离小于阈值设为透明（阈值根据背景亮度自适应）
    threshold = 30
    alpha = np.where(diff < threshold, 0, 255).astype(np.uint8)

    # 对 alpha 做轻微高斯模糊平滑边缘
    from scipy.ndimage import gaussian_filter
    alpha = gaussian_filter(alpha.astype(float), sigma=1)
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)

    data[:, :, 3] = alpha
    return Image.fromarray(data, "RGBA")


async def auto_segment(image_url: str) -> dict:
    """
    自动抠图
    优先使用 rembg，未安装则降级为 Pillow 颜色阈值
    返回: { mask_url: str, preview_url: str }
    """
    img = await _download_image(image_url)

    if REMBG_AVAILABLE:
        output = remove(img)
    else:
        print("[Segment] rembg 未安装，使用 Pillow 颜色阈值降级方案")
        output = _remove_background_pillow(img)

    # 生成 mask（纯白=保留，纯黑=镂空）
    mask = output.split()[-1]  # Alpha 通道
    mask_rgb = Image.merge("RGB", [mask, mask, mask])

    return {
        "mask_url": _image_to_base64(mask_rgb),
        "preview_url": _image_to_base64(output),
    }


async def composite_image(
    base_url: str,
    mask_data: str,
    fill_url: str,
    offset_x: int = 0,
    offset_y: int = 0,
    feather: int = 0,
) -> dict:
    """
    手动 mask 合成
    - base_url: 底图（会被镂空）
    - mask_data: 遮罩图（base64 或 URL，白=保留，黑=镂空）
    - fill_url: 填充图（放入镂空位置的图片）
    - offset_x/y: 填充图相对底图的偏移
    - feather: 边缘羽化像素
    返回: { composite_url: str }
    """
    base = await _download_image(base_url)
    fill = await _download_image(fill_url)

    # 下载 mask
    if mask_data.startswith("data:image"):
        header, encoded = mask_data.split(",", 1)
        mask_bytes = base64.b64decode(encoded)
        mask = Image.open(io.BytesIO(mask_bytes)).convert("L")
    else:
        mask = await _download_image(mask_data)
        mask = mask.convert("L")

    # 统一尺寸为底图大小
    base_w, base_h = base.size
    mask = mask.resize((base_w, base_h), Image.LANCZOS)

    # 羽化边缘
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))

    # 底图镂空：将底图对应 mask 黑色区域设为透明
    base = base.convert("RGBA")
    base.putalpha(ImageChops.multiply(base.split()[-1], mask))

    # 填充图缩放适配镂空区域（或保持原尺寸）
    fill = fill.convert("RGBA")

    # 创建合成画布
    canvas = Image.new("RGBA", (base_w, base_h), (0, 0, 0, 0))

    # 先画填充图（在镂空位置下方）
    canvas.paste(fill, (offset_x, offset_y), fill)

    # 再画镂空后的底图（覆盖在填充图上方）
    canvas.paste(base, (0, 0), base)

    return {
        "composite_url": _image_to_base64(canvas),
        "dimensions": {"width": base_w, "height": base_h},
    }


async def semantic_segment(image_url: str, prompt: str) -> dict:
    """
    语义抠图：LLM + SAM 协作分割
    1. LLM 分析图片语义，返回目标区域的 box + point_coords
    2. SAM (MobileSAM) 根据提示做像素级精确分割
    3. SAM 不可用时降级为 polygon 手绘模式
    返回: { mask_url: str, preview_url: str, description: str }
    """
    from app.core.llm_config import get_llm_config

    # 1. 下载原图获取尺寸
    img = await _download_image(image_url)
    img_w, img_h = img.size

    # 2. 构建多模态请求
    image_obj = {"type": "image_url", "image_url": {"url": image_url}}

    print("[Semantic Segment] 使用优化版 prompt (v3 - CoT)")
    system_prompt = f"""你是一个精确的计算机视觉专家。用户想要从图片中进行区域处理："{prompt}"。

**第一步：描述图片内容**
请先仔细观察图片，描述你看到的所有重要物体、它们的数量、相对位置和大小。例如：
- "图片中有3个红色方块，从左到右水平排列，大小相近"
- "图片中有一个相框，中间是空白区域，边框是木质纹理"
- "图片中有2个人，左边的人穿着蓝色衣服，右边的人穿着红色衣服"

**第二步：判断用户意图**
- 如果用户说"保留XX""提取XX""只保留XX""我要XX" → 用户想要保留该区域，其余去掉
- 如果用户说"去掉XX""删除XX""去掉中间""保留边框""去掉背景" → 用户想要去掉该区域，其余保留

**第三步：精确定位目标**
根据你的图片描述和用户意图，选择正确的目标区域，返回精确的 bounding box [x1, y1, x2, y2] 和中心点 [x, y]。

重要规则：
- 必须给出你的最佳判断，即使不太确定也要返回最可能的区域，不要直接拒绝
- box 和 point_coords 使用归一化坐标 0.0-1.0（左上角为原点）
- 对于"保留边框，去掉中间"这类需求：返回**中间内容区域**的 box 和点提示，mask_mode 设为 remove_polygon
- 对于"提取人物/物体"这类需求：返回该物体的 box 和点提示，mask_mode 设为 keep_polygon
- **box 必须紧密包裹单个目标区域，不要过大或过小，尤其不能同时框住多个物体**
- **如果图片中有多个相似物体，你必须明确说明你选择的是哪一个**（如"从左数第2个"、"最上面那个"、"中间那个"）
- **如果用户说"中间"，优先理解为"几何中心位置的那个物体"，而不是"每个物体的中间部分"**

严格返回 JSON（不要 Markdown 代码块），description 必须包含你的图片描述 + 目标选择理由。

**正确示例1（相框场景）：**
用户说"保留边框，去掉中间"
你看到的："图片中有一个金色相框，中间是白色照片区域，边框宽度约占图片的15%"
你选择：去掉中间白色区域
JSON：{{"mode": "sam", "box": [0.15, 0.15, 0.85, 0.85], "point_coords": [[0.5, 0.5]], "mask_mode": "remove_polygon", "description": "图片中有一个金色相框，中间是白色照片区域。选择中间白色区域进行镂空，保留金色边框"}}

**正确示例2（多物体场景）：**
用户说"去掉中间的方块"
你看到的："图片中有3个红色方块，从左到右水平排列，大小相近"
你选择：从左数第2个（中间那个）
JSON：{{"mode": "sam", "box": [0.35, 0.3, 0.65, 0.7], "point_coords": [[0.5, 0.5]], "mask_mode": "remove_polygon", "description": "图片中有3个红色方块水平排列。选择从左数第2个（中间）方块进行镂空"}}

**错误示例（不要这样做）：**
❌ {{"description": "保留边框，去掉中间"}} —— 这是复述用户输入，不是图片描述

mask_mode 定义：
- "keep_polygon" = 保留 SAM 分割出的区域，其余镂空（白色=保留）
- "remove_polygon" = 去掉 SAM 分割出的区域，其余保留（黑色=镂空）

如果 SAM 分割不可行（图片模糊/目标不明确），可降级返回 polygon 坐标：
{{"mode": "polygon", "points": [[x1,y1], [x2,y2], ...], "mask_mode": "keep_polygon" 或 "remove_polygon", "description": "图片描述 + 说明"}}

只有在图片完全空白或没有任何可辨识物体时，才返回：
{{"error": "无法检测到目标区域"}}"""

    # 3. 获取 LLM 配置并调用
    base_url, api_key = await get_llm_config()
    if not base_url or not api_key:
        raise RuntimeError("LLM 配置未就绪，无法进行语义分割")

    base_url = base_url.rstrip('/')
    if not base_url.endswith('/v1'):
        base_url = f"{base_url}/v1"

    models = ["gpt-4o", "gemini-2.5-flash", "gpt-4o-mini"]
    last_error = ""
    llm_result = None

    for model_name in models:
        try:
            print(f"[Semantic Segment] 尝试模型: {model_name} | Prompt: {prompt[:30]}...")
            payload = {
                "model": model_name,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            image_obj,
                            {"type": "text", "text": system_prompt}
                        ]
                    }
                ],
                "max_tokens": 2000,
                "temperature": 0.1
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )

                if resp.status_code == 429:
                    print(f"  └── 模型 {model_name} 饱和 (429)，尝试下一个...")
                    continue

                resp.raise_for_status()
                data = resp.json()

            content = data["choices"][0]["message"]["content"].strip()

            # 4. 解析 JSON
            m = re.search(r'\{[\s\S]*\}', content)
            if not m:
                print(f"[Semantic Segment] 模型返回无法解析: {content[:200]}")
                last_error = "模型返回格式异常"
                continue

            result = json.loads(m.group(0))

            if result.get("error"):
                print(f"[Semantic Segment] 模型报告无法检测: {result['error']}")
                last_error = result["error"]
                continue

            llm_result = result
            print(f"[Semantic Segment] LLM 分析完成: {result.get('description', '')}, mode={result.get('mode')}")
            break

        except Exception as e:
            last_error = str(e)
            print(f"[Semantic Segment] 模型 {model_name} 异常: {e}")
            continue

    if not llm_result:
        raise RuntimeError(f"语义分割失败: {last_error}")

    mask_mode = llm_result.get("mask_mode", "keep_polygon")
    is_remove = mask_mode == "remove_polygon"

    # 5. 优先使用 SAM 精确分割
    if llm_result.get("mode") == "sam" or (llm_result.get("box") or llm_result.get("point_coords")):
        try:
            from app.agents.experts.sam.mobilesam_segment import mobilesam_segment

            box = llm_result.get("box")
            point_coords = llm_result.get("point_coords")

            print(f"[Semantic Segment] 调用 SAM | box={box}, points={point_coords}")
            sam_result = await mobilesam_segment(
                image_url=image_url,
                point_coords=point_coords,
                box=box,
            )

            # 解码 SAM 返回的 mask
            mask_b64 = sam_result["mask_url"].split(",", 1)[1]
            mask_bytes = base64.b64decode(mask_b64)
            mask_img = Image.open(io.BytesIO(mask_bytes)).convert("L")
            mask_array = np.array(mask_img)

            # 根据 mask_mode 处理：remove 时 invert mask
            if is_remove:
                mask_array = 255 - mask_array
                mask_img = Image.fromarray(mask_array.astype(np.uint8), "L")

            # 生成 preview
            img_rgba = img.convert("RGBA")
            img_data = np.array(img_rgba)
            img_data[:, :, 3] = mask_array
            preview = Image.fromarray(img_data, "RGBA")
            mask_rgb = Image.merge("RGB", [mask_img, mask_img, mask_img])

            print(f"[Semantic Segment] ✅ SAM 精确分割完成: {llm_result.get('description', '')}")
            return {
                "mask_url": _image_to_base64(mask_rgb),
                "preview_url": _image_to_base64(preview),
                "description": llm_result.get("description", ""),
            }

        except Exception as e:
            print(f"[Semantic Segment] SAM 失败，降级到 polygon: {e}")
            # fallback 到 polygon 逻辑
            # 如果 LLM 返回了 box，用 box 的四个角点作为 polygon
            box = llm_result.get("box")
            if box and len(box) == 4:
                x1, y1, x2, y2 = box
                llm_result["points"] = [
                    [x1 * 1000, y1 * 1000],
                    [x2 * 1000, y1 * 1000],
                    [x2 * 1000, y2 * 1000],
                    [x1 * 1000, y2 * 1000],
                ]
                print(f"[Semantic Segment] 使用 box 生成 polygon fallback: {llm_result['points']}")

    # 6. Polygon fallback（SAM 不可用或 LLM 返回 polygon 模式）
    points = llm_result.get("points", [])
    if len(points) < 3:
        raise RuntimeError(f"语义分割失败: 坐标点不足 ({len(points)})")

    mask_img = Image.new('L', (img_w, img_h), 0 if not is_remove else 255)
    draw = ImageDraw.Draw(mask_img)

    actual_points = [
        (int(p[0] / 1000 * img_w), int(p[1] / 1000 * img_h))
        for p in points if isinstance(p, (list, tuple)) and len(p) == 2
    ]

    if len(actual_points) < 3:
        raise RuntimeError("语义分割失败: 有效坐标点不足")

    draw.polygon(actual_points, fill=0 if is_remove else 255)
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=1))

    img_rgba = img.convert("RGBA")
    img_data = np.array(img_rgba)
    mask_data = np.array(mask_img)
    img_data[:, :, 3] = mask_data
    preview = Image.fromarray(img_data, "RGBA")
    mask_rgb = Image.merge("RGB", [mask_img, mask_img, mask_img])

    print(f"[Semantic Segment] ✅ Polygon fallback 完成: {llm_result.get('description', '')}")
    return {
        "mask_url": _image_to_base64(mask_rgb),
        "preview_url": _image_to_base64(preview),
        "description": llm_result.get("description", ""),
    }
