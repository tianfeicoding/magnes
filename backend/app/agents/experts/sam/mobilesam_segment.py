"""
MobileSAM / Grabcut 交互式分割 Expert
支持：点提示分割、框提示分割、Grabcut 兜底
模型路径: backend/app/models/mobile_sam.pt (~40MB)
"""
import os
import io
import base64
import numpy as np
from PIL import Image, ImageFilter
import cv2

# 模型路径
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'models')
CHECKPOINT_PATH = os.path.join(MODEL_DIR, 'mobile_sam.pt')

# 尝试导入 MobileSAM
try:
    from mobile_sam import sam_model_registry, SamPredictor
    MOBILE_SAM_AVAILABLE = True
except ImportError:
    MOBILE_SAM_AVAILABLE = False
    print("[MobileSAM] mobile_sam 包未安装，尝试 segment_anything fallback")
    try:
        from segment_anything import sam_model_registry, SamPredictor
        MOBILE_SAM_AVAILABLE = True
        print("[MobileSAM] segment_anything 可用")
    except ImportError:
        MOBILE_SAM_AVAILABLE = False
        print("[MobileSAM] segment_anything 也未安装，将使用 Grabcut fallback")

# 全局模型缓存（懒加载）
_predictor = None

# 强制 PyTorch 单线程，避免 OpenMP 线程池与 Python ThreadPoolExecutor 竞争死锁
# 必须在第一次使用 torch 前设置
try:
    import torch
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
except Exception:
    pass


def _ensure_model():
    """确保模型文件存在"""
    if not os.path.exists(CHECKPOINT_PATH):
        raise RuntimeError(
            f"MobileSAM 模型文件不存在: {CHECKPOINT_PATH}\n"
            "请手动下载模型文件:\n"
            "1. 访问 https://github.com/ChaoningZhang/MobileSAM/releases\n"
            "2. 下载 mobile_sam.pt (~40MB)\n"
            "3. 放置到 backend/app/models/mobile_sam.pt\n"
            "或尝试自动下载: python -c \"from app.agents.experts.sam.mobilesam_segment import download_model; download_model()\""
        )


def download_model():
    """尝试自动下载模型"""
    os.makedirs(MODEL_DIR, exist_ok=True)
    urls = [
        "https://github.com/ChaoningZhang/MobileSAM/releases/download/v1.0/mobile_sam.pt",
        "https://huggingface.co/dhkim2810/MobileSAM/resolve/main/mobile_sam.pt",
    ]
    for url in urls:
        try:
            print(f"[MobileSAM] 尝试下载: {url}")
            import urllib.request
            urllib.request.urlretrieve(url, CHECKPOINT_PATH)
            print(f"[MobileSAM] 下载成功: {CHECKPOINT_PATH}")
            return True
        except Exception as e:
            print(f"[MobileSAM] 下载失败: {e}")
    return False


def _get_predictor():
    """懒加载 SAM Predictor"""
    global _predictor
    if _predictor is not None:
        return _predictor

    _ensure_model()

    if not MOBILE_SAM_AVAILABLE:
        raise RuntimeError("SAM 包未安装，无法加载模型")

    import torch

    # MobileSAM 使用 vit_t，如果不可用则尝试 vit_b
    model_type = "vit_t" if "vit_t" in sam_model_registry else "vit_b"
    sam = sam_model_registry[model_type](checkpoint=CHECKPOINT_PATH)
    sam.eval()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    sam.to(device=device)

    _predictor = SamPredictor(sam)
    print(f"[MobileSAM] 模型加载完成，设备: {device}")
    return _predictor


async def _download_image(url: str) -> np.ndarray:
    """异步下载图片并转为 numpy array (RGB)"""
    if url.startswith("data:image"):
        header, encoded = url.split(",", 1)
        data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(data)).convert("RGB")
    else:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                data = await resp.read()
                img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(img)


def _image_to_base64(img: Image.Image, fmt: str = "PNG") -> str:
    """PIL Image 转 base64 data URL"""
    buffer = io.BytesIO()
    img.save(buffer, format=fmt)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64,{b64}"


def _grabcut_segment(image: np.ndarray, bbox: tuple) -> np.ndarray:
    """
    Grabcut 分割兜底方案
    bbox: (x, y, w, h) 像素坐标
    """
    mask = np.zeros(image.shape[:2], np.uint8)
    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)

    cv2.grabCut(image, mask, bbox, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_RECT)

    # 0=背景, 2=可能背景 → 0；1=前景, 3=可能前景 → 255
    mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype("uint8")
    return mask2 * 255


def _mask_to_output(mask: np.ndarray, original_img: np.ndarray) -> dict:
    """将二进制 mask 转为输出格式"""
    # Mask 灰度图
    mask_img = Image.fromarray(mask.astype(np.uint8), "L")
    mask_rgb = Image.merge("RGB", [mask_img, mask_img, mask_img])

    # 预览图（应用 alpha）
    img_rgba = Image.fromarray(original_img).convert("RGBA")
    img_data = np.array(img_rgba)
    img_data[:, :, 3] = mask.astype(np.uint8)
    preview = Image.fromarray(img_data, "RGBA")

    return {
        "mask_url": _image_to_base64(mask_rgb),
        "preview_url": _image_to_base64(preview),
    }


def _run_sam_sync(img: np.ndarray, point_coords: list, box: list) -> np.ndarray:
    """同步执行 SAM 推理（供线程池调用）"""
    import time
    start = time.time()
    print("[MobileSAM][_run_sam_sync] 开始执行")

    img_h, img_w = img.shape[:2]
    print(f"[MobileSAM][_run_sam_sync] 图片尺寸: {img_w}x{img_h}")

    print("[MobileSAM][_run_sam_sync] 加载 predictor...")
    predictor = _get_predictor()
    print(f"[MobileSAM][_run_sam_sync] predictor 加载完成, 耗时: {time.time()-start:.2f}s")

    t1 = time.time()
    print("[MobileSAM][_run_sam_sync] set_image 开始...")
    predictor.set_image(img)
    print(f"[MobileSAM][_run_sam_sync] set_image 完成, 耗时: {time.time()-t1:.2f}s")

    t2 = time.time()
    if point_coords and len(point_coords) > 0:
        print(f"[MobileSAM][_run_sam_sync] point 模式, points={point_coords}")
        points = np.array([[p[0] * img_w, p[1] * img_h] for p in point_coords])
        labels = np.array([1] * len(points))
        masks, scores, logits = predictor.predict(
            point_coords=points,
            point_labels=labels,
            multimask_output=True,
        )
    elif box:
        print(f"[MobileSAM][_run_sam_sync] box 模式, box={box}")
        box_pixel = np.array(
            [box[0] * img_w, box[1] * img_h, box[2] * img_w, box[3] * img_h]
        )
        print(f"[MobileSAM][_run_sam_sync] box_pixel={box_pixel.tolist()}")
        masks, scores, logits = predictor.predict(
            box=box_pixel,
            multimask_output=False,
        )
    else:
        raise ValueError("需要提供 point_coords 或 box")

    print(f"[MobileSAM][_run_sam_sync] predict 完成, 耗时: {time.time()-t2:.2f}s")
    best_idx = int(scores.argmax())
    result = (masks[best_idx] * 255).astype(np.uint8)
    print(f"[MobileSAM][_run_sam_sync] 执行结束, 总耗时: {time.time()-start:.2f}s")
    return result


async def mobilesam_segment(
    image_url: str,
    point_coords: list = None,
    box: list = None,
    use_grabcut: bool = False,
) -> dict:
    """
    MobileSAM / Grabcut 交互式分割
    point_coords: [[x, y], ...] 归一化坐标 0-1
    box: [x1, y1, x2, y2] 归一化坐标 0-1
    use_grabcut: 强制使用 Grabcut（即使 SAM 可用）
    """
    import asyncio

    img = await _download_image(image_url)
    img_h, img_w = img.shape[:2]

    # 模式判断
    sam_ready = MOBILE_SAM_AVAILABLE and os.path.exists(CHECKPOINT_PATH)

    if sam_ready and not use_grabcut:
        # MobileSAM 模式：直接在主线程执行（uvicorn + run_in_executor 在 Mac 上有死锁问题）
        print(f"[MobileSAM] 开始 SAM 推理 | box={box}, points={point_coords}")
        best_mask = _run_sam_sync(img, point_coords, box)
        print(f"[MobileSAM] SAM 推理完成")
        return _mask_to_output(best_mask, img)

    else:
        # Grabcut 兜底模式
        if not box:
            if point_coords and len(point_coords) > 0:
                cx = point_coords[0][0] * img_w
                cy = point_coords[0][1] * img_h
                w = int(img_w * 0.6)
                h = int(img_h * 0.6)
                x = max(0, int(cx - w / 2))
                y = max(0, int(cy - h / 2))
                w = min(w, img_w - x)
                h = min(h, img_h - y)
                bbox = (x, y, w, h)
            else:
                raise ValueError("Grabcut 模式需要提供 box 或 point_coords")
        else:
            bbox = (
                int(box[0] * img_w),
                int(box[1] * img_h),
                int((box[2] - box[0]) * img_w),
                int((box[3] - box[1]) * img_h),
            )

        print(f"[MobileSAM] SAM 不可用，使用 Grabcut fallback, bbox: {bbox}")
        loop = asyncio.get_event_loop()
        mask = await loop.run_in_executor(None, _grabcut_segment, img, bbox)
        return _mask_to_output(mask, img)
