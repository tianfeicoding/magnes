# ocr_engine.py
"""
OCR 核心引擎 - 基于 PaddleOCR 本地推理

"""
from __future__ import annotations
import os
import sys
import tempfile
import requests
from typing import List, Optional

# 尝试导入依赖，降低环境安装强制性
try:
    from paddleocr import PaddleOCR
    PADDLEOCR_AVAILABLE = True
except ImportError:
    PADDLEOCR_AVAILABLE = False


class OCRProcessor:
    """OCR 处理器"""
    
    def __init__(self, use_paddleocr: bool = True, use_lang: str = 'ch'):
        """
        Args:
            use_paddleocr: 是否使用 PaddleOCR（本地）
            use_lang: PaddleOCR 语言，'ch' 中文，'en' 英文
        """
        self.use_paddleocr = use_paddleocr and PADDLEOCR_AVAILABLE
        self.ocr_engine = None
        
        if self.use_paddleocr:
            try:
                # 初始化 PaddleOCR 引擎
                # 优化参数：use_angle_cls=True 自动识别文字方向
                self.ocr_engine = PaddleOCR(use_angle_cls=True, lang=use_lang, show_log=False)
                print(f"[OCR Engine] ✓ PaddleOCR 本地引擎初始化成功 (lang={use_lang})")
            except Exception as e:
                print(f"[OCR Engine] ⚠️ PaddleOCR 初始化失败: {e}")
                self.use_paddleocr = False
    
    def ocr_image_from_url(self, image_url: str) -> str:
        """从图片 URL 识别文字"""
        if not image_url or not image_url.startswith('http'):
            return ""
        
        try:
            # Magnes 风格的请求头
            headers = {
                'User-Agent': 'Magnes/1.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Referer': 'https://www.xiaohongshu.com/',
            }
            response = requests.get(image_url, headers=headers, timeout=20, stream=True)
            response.raise_for_status()
            
            # 自动探测后缀
            content_type = response.headers.get('Content-Type', '').lower()
            suffix = '.png' if 'png' in content_type else ('.gif' if 'gif' in content_type else '.jpg')
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                for chunk in response.iter_content(chunk_size=8192):
                    tmp_file.write(chunk)
                tmp_path = tmp_file.name
            
            try:
                text = self.ocr_image_from_file(tmp_path)
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            return text
            
        except Exception as e:
            print(f"[OCR Engine] ❌ 从 URL 抓取并 OCR 失败: {e}")
            return ""
    
    def ocr_image_from_file(self, image_path: str) -> str:
        """从本地图片文件识别文字"""
        if not (self.use_paddleocr and self.ocr_engine):
            if not PADDLEOCR_AVAILABLE:
                print("[OCR Engine] ⚠️ PaddleOCR 未安装，跳过识别。请执行 pip install paddleocr")
            return ""
            
        try:
            # 预测
            result = self.ocr_engine.ocr(image_path)
            if not result or not result[0]:
                return ""
            
            # 解析结果：PaddleOCR 返回 [ [[坐标], (文字, 置信度)], ... ]
            texts = []
            for line in result[0]:
                if line and len(line) >= 2:
                    text = line[1][0]
                    # 过滤噪音
                    if text and len(text.strip()) > 1 and not self._is_noise(text):
                        texts.append(text)
            
            return "\n".join(texts)
        except Exception as e:
            print(f"[OCR Engine] ❌ OCR 处理文件异常: {e}")
            return ""

    def _is_noise(self, text: str) -> bool:
        """过滤路径、系统关键字等噪音"""
        t = text.lower().strip()
        if t in ['none', 'null', 'true', 'false', 'min', 'max'] or len(t) < 1:
            return True
        if '/' in t or '\\' in t or 'http' in t:
             return True
        return False
    
    def batch_ocr(self, image_urls: List[str]) -> str:
        """批量 OCR 多张图片"""
        if not image_urls:
            return ""
        
        combined_results = []
        for i, url in enumerate(image_urls, 1):
            text = self.ocr_image_from_url(url)
            if text:
                combined_results.append(f"--- 图层 {i} OCR 文字 ---\n{text}")
        
        return "\n\n".join(combined_results)

# 单例模式，避免重复初始化大模型
_global_processor = None

def get_ocr_processor():
    global _global_processor
    if _global_processor is None:
        _global_processor = OCRProcessor()
    return _global_processor
