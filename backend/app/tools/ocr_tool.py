# ocr_tool.py
"""
OCR 专用工具 - 供 Planner 主动调用
当 AI 发现笔记或知识库图片的文字信息不足以回答问题时使用
"""
import asyncio
from typing import List, Dict, Any
from app.tools.ocr_engine import get_ocr_processor

class OCRTool:
    """OCR 工具封装，适配 Planner 异步调用协议"""
    
    @staticmethod
    async def scan_note_images(image_urls: List[str]) -> Dict[str, Any]:
        """
        对多张图片进行 OCR 扫描并提取文字内容。
        适用场景：当用户问及海报上的时间、地点或具体数据，而正文未提供时。
        """
        if not image_urls:
            return {"status": "error", "message": "未提供图片 URL"}
            
        print(f"[OCR Tool] 🚀 Planner 触发 OCR 扫描任务，共 {len(image_urls)} 张图片...")
        
        try:
            # 在单独的线程池中运行同步推理，避免阻塞主循环
            loop = asyncio.get_event_loop()
            ocr_proc = get_ocr_processor()
            
            # 使用 run_in_executor 执行同步的 batch_ocr
            # 注意：PaddleOCR 本身通常不是线程安全的，但顺序执行 batch_ocr 是可以的
            # 我们仅扫描前 3 张重点图片
            result_text = await loop.run_in_executor(None, ocr_proc.batch_ocr, image_urls[:3])
            
            if result_text:
                print(f"[OCR Tool] ✅ 扫描完成，获得 {len(result_text)} 字符内容")
                return {
                    "status": "success",
                    "content": result_text,
                    "summary": f"成功扫描 {min(3, len(image_urls))} 张图片并提取到文字信息。"
                }
            else:
                return {"status": "success", "content": "", "message": "图片中未识别到有效文字"}
                
        except Exception as e:
            print(f"[OCR Tool] ❌ 扫描失败: {e}")
            return {"status": "error", "message": str(e)}

    @staticmethod
    async def scan_single_image(image_url: str) -> Dict[str, Any]:
        """对单张图片进行深度 OCR 扫描"""
        return await OCRTool.scan_note_images([image_url])
