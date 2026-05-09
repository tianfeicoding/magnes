
import os
import hashlib
import httpx
import asyncio
from typing import Optional, Protocol
from pathlib import Path

# ─── 存储引擎协议 ──────────────────────────────────────────────────────────

class StorageEngine(Protocol):
    async def save(self, image_data: bytes, category: str, extension: str) -> str:
        """保存图片并返回其唯一标识符或 URL"""
        ...

    def get_url(self, image_id: str, category: str) -> str:
        """根据标识符获取访问 URL"""
        ...

# ─── 本地存储实现 ──────────────────────────────────────────────────────────

class LocalStorageEngine:
    def __init__(self, base_dir: str = None):
        if base_dir is None:
            # 使用相对于 main.py 的绝对路径
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            self.base_dir = Path(backend_dir) / "data" / "rag_images"
        else:
            self.base_dir = Path(base_dir)
            
        self.base_dir.mkdir(parents=True, exist_ok=True)
        # 为不同分类创建子目录
        (self.base_dir / "xhs").mkdir(exist_ok=True)
        (self.base_dir / "gallery").mkdir(exist_ok=True)
        (self.base_dir / "knowledge").mkdir(exist_ok=True)

    async def save(self, image_data: bytes, category: str, extension: str) -> str:
        # 使用内容哈希作为文件名，去重
        h = hashlib.md5(image_data).hexdigest()
        filename = f"{h}.{extension.strip('.')}"
        file_path = self.base_dir / category / filename
        
        # 异步写入
        def _write():
            with open(file_path, "wb") as f:
                f.write(image_data)
        
        await asyncio.to_thread(_write)
        return filename

    def get_url(self, image_id: str, category: str) -> str:
        # 返回一个特殊的相对路径标识，前端或后端路由会据此拼凑完整地址
        return f"/api/v1/rag/images/{category}/{image_id}"

# ─── 图片管理服务 ──────────────────────────────────────────────────────────

class ImageService:
    def __init__(self, engine: StorageEngine):
        self.engine = engine
        # 增加请求头模拟浏览器，规避小红书等平台的 403 防盗链
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            "Referer": "https://www.xiaohongshu.com/"
        }
        self.client = httpx.AsyncClient(headers=headers, timeout=30.0, follow_redirects=True)

    async def download_and_save(self, url: str, category: str) -> Optional[str]:
        """下载并保存图片，返回本地路径或标识"""
        if not url or not url.startswith("http"):
            return url

        try:
            resp = await self.client.get(url)
            resp.raise_for_status()
            
            # 检测后缀
            content_type = resp.headers.get("Content-Type", "")
            ext = "jpg"
            if "png" in content_type: ext = "png"
            elif "webp" in content_type: ext = "webp"
            elif "gif" in content_type: ext = "gif"
            
            # 如果 URL 里有明确的后缀，优先提取
            url_path = url.split("?")[0]
            if "." in url_path:
                potential_ext = url_path.split(".")[-1].lower()
                if potential_ext in ["jpg", "jpeg", "png", "webp", "gif"]:
                    ext = potential_ext if potential_ext != "jpeg" else "jpg"

            image_id = await self.engine.save(resp.content, category, ext)
            return self.engine.get_url(image_id, category)
        except Exception as e:
            print(f"[ImageService] ❌ 下载图片失败 ({url}): {e}")
            return url # 失败则回退到原始 URL

# 全局单例
_storage_engine = LocalStorageEngine()
image_service = ImageService(_storage_engine)
