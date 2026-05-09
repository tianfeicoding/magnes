import os
import aiohttp
import uuid
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 定义基础路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def download_and_persist_image(url: str) -> Optional[str]:
    """
    下载外部图片并持久化存储到本地。
    返回本地相对路径 (例如 /uploads/xyz.jpg)，若失败则返回原 URL。
    """
    if not url or not url.startswith("http"):
        return url

    # 避免重复下载本地已有的资源 (虽然逻辑上外部 URL 很少以 /uploads 开头)
    if url.startswith("/uploads"):
        return url

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=30) as response:
                if response.status != 200:
                    logger.error(f"Failed to download image: {url}, status: {response.status}")
                    return url
                
                content = await response.read()
                
                # 生成唯一文件名
                ext = "png"
                content_type = response.headers.get("Content-Type", "")
                if "jpeg" in content_type or "jpg" in content_type:
                    ext = "jpg"
                elif "webp" in content_type:
                    ext = "webp"
                
                filename = f"{uuid.uuid4()}.{ext}"
                filepath = os.path.join(UPLOAD_DIR, filename)
                
                with open(filepath, "wb") as f:
                    f.write(content)
                
                local_path = f"/uploads/{filename}"
                logger.info(f"Successfully persisted image: {url} -> {local_path}")
                return local_path
                
    except Exception as e:
        logger.error(f"Error persisting image {url}: {e}")
        return url

def is_local_path(path: str) -> bool:
    """判断是否为本地持久化路径"""
    return path.startswith("/uploads")

async def save_base64_image(data_url: str) -> Optional[str]:
    """
    将 base64 Data URL 保存为本地文件。
    返回本地相对路径 (例如 /uploads/xyz.jpg)，若失败则返回 None。
    """
    import base64
    import re as _re

    if not data_url or not data_url.startswith("data:image"):
        return None

    try:
        # 解析 data URL 格式: data:image/jpeg;base64,<data>
        match = _re.match(r"data:image/(\w+);base64,(.+)", data_url, _re.DOTALL)
        if not match:
            return None
        
        ext = match.group(1).lower()
        if ext == "jpeg":
            ext = "jpg"
        elif ext not in ("png", "jpg", "webp", "gif"):
            ext = "png"
        
        raw_data = base64.b64decode(match.group(2))
        filename = f"{uuid.uuid4()}.{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        with open(filepath, "wb") as f:
            f.write(raw_data)
        
        local_path = f"/uploads/{filename}"
        logger.info(f"Saved base64 image to {local_path} ({len(raw_data)} bytes)")
        return local_path

    except Exception as e:
        logger.error(f"Error saving base64 image: {e}")
        return None

