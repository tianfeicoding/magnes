"""
Playwright 图片生成服务
用于服务端渲染小红书海报图片
"""
import os
import base64
import json
from typing import Optional, Dict, Any, List
from pathlib import Path

try:
    from playwright.async_api import async_playwright, Page, Browser
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("⚠️ Playwright 未安装，图片生成功能将不可用")
    print("   请运行: pip install playwright && playwright install chromium")


class ImageGenerator:
    """基于 Playwright 的图片生成器"""
    
    def __init__(self):
        self.browser: Optional[Browser] = None
        self._initialized = False
    
    async def initialize(self):
        """初始化浏览器实例"""
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright 未安装")
        
        if self._initialized:
            return
        
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self._initialized = True
        print("🎭 Playwright 浏览器已初始化")
    
    async def close(self):
        """关闭浏览器"""
        if self.browser:
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
        self._initialized = False
    
    async def generate_rednote_image(
        self,
        title: str,
        subtitle: Optional[str] = None,
        content: Optional[str] = None,
        date: Optional[str] = None,
        location: Optional[str] = None,
        template: str = "default",
        width: int = 800,
        height: int = 1200,
        background_color: str = "#FFE4E1",
        text_color: str = "#333333",
        accent_color: str = "#E91E63"
    ) -> bytes:
        """
        生成小红书风格海报图片
        
        Args:
            title: 主标题
            subtitle: 副标题
            content: 正文内容
            date: 日期信息
            location: 地点信息
            template: 模板类型
            width: 图片宽度
            height: 图片高度
            background_color: 背景色
            text_color: 文字颜色
            accent_color: 强调色
            
        Returns:
            PNG 图片字节数据
        """
        if not self._initialized:
            await self.initialize()
        
        # 生成 HTML 内容
        html_content = self._generate_html(
            title=title,
            subtitle=subtitle,
            content=content,
            date=date,
            location=location,
            template=template,
            width=width,
            height=height,
            background_color=background_color,
            text_color=text_color,
            accent_color=accent_color
        )
        
        # 创建新页面
        page = await self.browser.new_page(viewport={'width': width, 'height': height})
        
        try:
            # 加载 HTML
            await page.set_content(html_content)
            
            # 等待字体和样式渲染
            await page.wait_for_timeout(1500)
            
            # 截图
            screenshot = await page.screenshot(type='png', full_page=False)
            
            return screenshot
            
        finally:
            await page.close()
    
    def _generate_html(
        self,
        title: str,
        subtitle: Optional[str],
        content: Optional[str],
        date: Optional[str],
        location: Optional[str],
        template: str,
        width: int,
        height: int,
        background_color: str,
        text_color: str,
        accent_color: str
    ) -> str:
        """生成海报 HTML"""
        
        # 处理内容换行
        content_html = ""
        if content:
            for line in content.split('\n'):
                if line.strip():
                    content_html += f'<div class="content-line">{line}</div>'
        
        # 日期和地点
        meta_html = ""
        if date:
            meta_html += f'<div class="meta-item">📅 {date}</div>'
        if location:
            meta_html += f'<div class="meta-item">📍 {location}</div>'
        
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap');
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
            width: {width}px;
            height: {height}px;
            background: linear-gradient(135deg, {background_color} 0%, #FFF5F5 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 50px;
            position: relative;
            overflow: hidden;
        }}
        
        /* 装饰元素 */
        .decoration {{
            position: absolute;
            border-radius: 50%;
            opacity: 0.1;
        }}
        
        .decoration-1 {{
            width: 300px;
            height: 300px;
            background: {accent_color};
            top: -100px;
            right: -100px;
        }}
        
        .decoration-2 {{
            width: 200px;
            height: 200px;
            background: {accent_color};
            bottom: -50px;
            left: -50px;
        }}
        
        /* 主容器 */
        .container {{
            width: 100%;
            text-align: center;
            z-index: 1;
        }}
        
        /* 标题 */
        .title {{
            font-size: 56px;
            font-weight: 900;
            color: {text_color};
            line-height: 1.3;
            margin-bottom: 20px;
            letter-spacing: 2px;
        }}
        
        /* 副标题 */
        .subtitle {{
            font-size: 32px;
            font-weight: 500;
            color: {accent_color};
            margin-bottom: 40px;
            letter-spacing: 4px;
        }}
        
        /* 分隔线 */
        .divider {{
            width: 80px;
            height: 4px;
            background: {accent_color};
            margin: 30px auto;
            border-radius: 2px;
        }}
        
        /* 内容区 */
        .content {{
            font-size: 28px;
            color: {text_color};
            line-height: 1.8;
            margin: 30px 0;
        }}
        
        .content-line {{
            margin: 10px 0;
        }}
        
        /* 元信息 */
        .meta {{
            margin-top: 40px;
            padding-top: 30px;
            border-top: 2px dashed rgba(233, 30, 99, 0.3);
        }}
        
        .meta-item {{
            font-size: 24px;
            color: #666;
            margin: 10px 0;
        }}
        
        /* 小红书风格标签 */
        .tag {{
            display: inline-block;
            background: {accent_color};
            color: white;
            font-size: 20px;
            padding: 8px 20px;
            border-radius: 20px;
            margin-top: 30px;
        }}
    </style>
</head>
<body>
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    
    <div class="container">
        <h1 class="title">{title}</h1>
        {f'<div class="subtitle">{subtitle}</div>' if subtitle else ''}
        <div class="divider"></div>
        {f'<div class="content">{content_html}</div>' if content_html else ''}
        {f'<div class="meta">{meta_html}</div>' if meta_html else ''}
        <div class="tag">小红书</div>
    </div>
</body>
</html>'''
        
        return html
    
    async def generate_from_magnes_template(
        self,
        template_id: str,
        events: List[Dict[str, Any]],
        width: int = 1000,
        height: int = 1333
    ) -> bytes:
        """
        基于 Magnes 粉色活动模板生成图片
        
        Args:
            template_id: 模板ID
            events: 活动列表，每个活动包含 title, date, venue, price, description
            width: 图片宽度
            height: 图片高度
            
        Returns:
            PNG 图片字节数据
        """
        if not self._initialized:
            await self.initialize()
        
        # 使用模板原始尺寸 (896x1200) 以保持坐标一致
        # 背景图 pink_template.jpg 尺寸为 896x1200
        template_width = 896
        template_height = 1200
        
        # 生成 HTML 内容 - 使用模板精确坐标
        html_content = self._generate_pink_template_html(events, template_width, template_height)
        
        # 创建新页面 - 使用模板尺寸
        page = await self.browser.new_page(viewport={'width': template_width, 'height': template_height})
        
        try:
            # 加载 HTML
            await page.set_content(html_content)
            
            # 等待字体和样式渲染
            await page.wait_for_timeout(2000)
            
            # 截图 - 使用模板尺寸
            screenshot = await page.screenshot(type='png', full_page=False)
            
            return screenshot
            
        finally:
            await page.close()
    
    def _generate_pink_template_html(
        self,
        events: List[Dict[str, Any]],
        width: int,
        height: int
    ) -> str:
        """生成粉色活动模板风格的海报 HTML - 使用 Magnes 模板的精确坐标"""
        
        # 使用真实的 pink_template.jpg 背景
        bg_image_url = "http://localhost:8088/uploads/pink_template.jpg"
        text_color = "#6B4A2F"  # 棕色文字
        
        # 生成活动 HTML - 使用 Magnes 模板的精确坐标
        event_html_parts = []
        
        # 定义三个活动的精确坐标（根据 pink_template.jpg 实际布局调整）
        # bbox: [x, y, width, height]
        # 调整 Y 坐标使文字居中在粉色块内
        event_positions = [
            {
                "title_bbox": [120, 155, 564, 45],
                "date_bbox": [120, 205, 562, 36],
                "venue_bbox": [120, 245, 562, 36],
                "price_bbox": [120, 285, 562, 36],
                "desc_bbox": [120, 325, 562, 36],
                "image_bbox": [689, 116, 223, 208]
            },
            {
                "title_bbox": [120, 445, 556, 45],
                "date_bbox": [120, 495, 545, 36],
                "venue_bbox": [120, 535, 545, 36],
                "price_bbox": [120, 575, 545, 36],
                "desc_bbox": [120, 615, 545, 36],
                "image_bbox": [689, 399, 220, 208]
            },
            {
                "title_bbox": [120, 740, 562, 45],
                "date_bbox": [120, 790, 545, 36],
                "venue_bbox": [120, 830, 545, 36],
                "price_bbox": [120, 870, 545, 36],
                "desc_bbox": [120, 910, 545, 36],
                "image_bbox": [689, 695, 214, 210]
            }
        ]
        
        for i, event in enumerate(events[:3]):
            pos = event_positions[i]
            
            # 处理 Pydantic 模型或 dict
            if hasattr(event, 'dict'):
                event_data = event.dict()
            elif hasattr(event, 'model_dump'):
                event_data = event.model_dump()
            else:
                event_data = dict(event)
            
            # 图片占位符
            img_html = f'''<div class="image-placeholder" style="left: {pos["image_bbox"][0]}px; top: {pos["image_bbox"][1]}px; width: {pos["image_bbox"][2]}px; height: {pos["image_bbox"][3]}px;"></div>'''
            
            # 标题 - 35px, bold, color: #6B4A2F
            title_html = f'''<div class="event-text title" style="left: {pos["title_bbox"][0]}px; top: {pos["title_bbox"][1]}px; width: {pos["title_bbox"][2]}px; height: {pos["title_bbox"][3]}px; line-height: {pos["title_bbox"][3]}px;">{event_data.get("title", "")}</div>'''
            
            # 日期 - 25px, normal
            date_html = f'''<div class="event-text meta" style="left: {pos["date_bbox"][0]}px; top: {pos["date_bbox"][1]}px; width: {pos["date_bbox"][2]}px; height: {pos["date_bbox"][3]}px; line-height: {pos["date_bbox"][3]}px;">{event_data.get("date", "")}</div>'''
            
            # 地点
            venue_html = f'''<div class="event-text meta" style="left: {pos["venue_bbox"][0]}px; top: {pos["venue_bbox"][1]}px; width: {pos["venue_bbox"][2]}px; height: {pos["venue_bbox"][3]}px; line-height: {pos["venue_bbox"][3]}px;">{event_data.get("venue", "")}</div>'''
            
            # 价格
            price_html = f'''<div class="event-text meta" style="left: {pos["price_bbox"][0]}px; top: {pos["price_bbox"][1]}px; width: {pos["price_bbox"][2]}px; height: {pos["price_bbox"][3]}px; line-height: {pos["price_bbox"][3]}px;">{event_data.get("price", "")}</div>'''
            
            # 描述
            desc_html = f'''<div class="event-text meta" style="left: {pos["desc_bbox"][0]}px; top: {pos["desc_bbox"][1]}px; width: {pos["desc_bbox"][2]}px; height: {pos["desc_bbox"][3]}px; line-height: {pos["desc_bbox"][3]}px;">{event_data.get("description", "")}</div>'''
            
            event_html_parts.extend([img_html, title_html, date_html, venue_html, price_html, desc_html])
        
        events_html = '\n'.join(event_html_parts)
        
        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Noto Sans SC', sans-serif;
            width: {width}px;
            height: {height}px;
            background-image: url('{bg_image_url}');
            background-size: {width}px {height}px;
            background-position: 0 0;
            background-repeat: no-repeat;
            position: relative;
            overflow: hidden;
        }}
        
        /* 图片占位符 */
        .image-placeholder {{
            position: absolute;
            background: transparent;
        }}
        
        /* 文字样式 - 精确匹配 Magnes 模板 */
        .event-text {{
            position: absolute;
            color: {text_color};
            font-family: 'PingFang SC', sans-serif;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            display: flex;
            align-items: center;
        }}
        
        .event-text.title {{
            font-size: 35px;
            font-weight: bold;
        }}
        
        .event-text.meta {{
            font-size: 25px;
            font-weight: normal;
        }}
    </style>
</head>
<body>
    {events_html}
</body>
</html>'''
        
        return html


# 全局实例
_generator: Optional[ImageGenerator] = None


async def get_generator() -> ImageGenerator:
    """获取或创建图片生成器实例"""
    global _generator
    if _generator is None:
        _generator = ImageGenerator()
        await _generator.initialize()
    return _generator


async def close_generator():
    """关闭图片生成器"""
    global _generator
    if _generator:
        await _generator.close()
        _generator = None


async def generate_image(
    title: str,
    subtitle: Optional[str] = None,
    content: Optional[str] = None,
    date: Optional[str] = None,
    location: Optional[str] = None,
    template: str = "default",
    width: int = 800,
    height: int = 1200
) -> bytes:
    """
    便捷函数：生成小红书海报图片
    
    Returns:
        PNG 图片字节数据
    """
    generator = await get_generator()
    return await generator.generate_rednote_image(
        title=title,
        subtitle=subtitle,
        content=content,
        date=date,
        location=location,
        template=template,
        width=width,
        height=height
    )
