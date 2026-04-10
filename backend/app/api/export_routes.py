"""
Export Routes
图片导出 API 端点
支持服务端生成小红书海报图片
"""
import io
import base64
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter(
    prefix="/export",
    tags=["export"]
)


# ─── 请求/响应数据模型 ───────────────────────────────────────────────────────

class GenerateImageRequest(BaseModel):
    """生成图片请求"""
    title: str                          # 主标题（必填）
    subtitle: Optional[str] = None      # 副标题
    content: Optional[str] = None       # 正文内容
    date: Optional[str] = None          # 日期
    location: Optional[str] = None      # 地点
    template: str = "default"           # 模板类型
    width: int = 800                    # 图片宽度
    height: int = 1200                  # 图片高度
    background_color: str = "#FFE4E1"   # 背景色
    text_color: str = "#333333"         # 文字颜色
    accent_color: str = "#E91E63"       # 强调色
    format: str = "png"                 # 输出格式 (png/jpg)
    return_type: str = "file"           # 返回类型 (file/base64)


class EventData(BaseModel):
    """活动数据"""
    title: str
    date: Optional[str] = None
    venue: Optional[str] = None
    price: Optional[str] = None
    description: Optional[str] = None


class GenerateFromTemplateRequest(BaseModel):
    """基于模板生成图片请求"""
    template_id: str = "template-1773666891013"  # 模板ID
    events: List[EventData]                        # 活动列表
    width: int = 1000                              # 图片宽度
    height: int = 1333                             # 图片高度
    return_type: str = "file"                      # 返回类型 (file/base64)


class GenerateImageResponse(BaseModel):
    """生成图片响应"""
    status: str
    message: str
    image_base64: Optional[str] = None
    url: Optional[str] = None


# ─── API 端点 ─────────────────────────────────────────────────────────────────

@router.post("/image")
async def generate_image(request: GenerateImageRequest):
    """
    POST /api/v1/export/image
    
    生成小红书风格海报图片
    
    示例请求:
    ```json
    {
        "title": "上海三月市集活动",
        "subtitle": "春日限定 限时三天",
        "date": "3月15-17日",
        "location": "上海静安嘉里中心",
        "template": "event_poster"
    }
    ```
    
    返回:
    - return_type="file": 直接返回 PNG 图片文件流
    - return_type="base64": 返回 JSON 包含 base64 编码的图片
    """
    try:
        from app.core.image_generator import generate_image
        
        # 生成图片
        image_bytes = await generate_image(
            title=request.title,
            subtitle=request.subtitle,
            content=request.content,
            date=request.date,
            location=request.location,
            template=request.template,
            width=request.width,
            height=request.height
        )
        
        if request.return_type == "base64":
            # 返回 base64 编码
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            return JSONResponse(content={
                "status": "success",
                "message": "图片生成成功",
                "image_base64": f"data:image/png;base64,{image_base64}",
                "width": request.width,
                "height": request.height
            })
        else:
            # 返回文件流 - 使用正确的文件名编码
            safe_filename = request.title[:20].encode('ascii', 'ignore').decode('ascii')
            safe_filename = safe_filename.replace(' ', '_')
            if not safe_filename:
                safe_filename = "poster"
            return StreamingResponse(
                io.BytesIO(image_bytes),
                media_type="image/png",
                headers={
                    "Content-Disposition": f"inline; filename=\"rednote_{safe_filename}.png\""
                }
            )
            
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Playwright 未安装，请运行: pip install playwright && playwright install chromium"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"图片生成失败: {str(e)}"
        )


@router.get("/image")
async def generate_image_get(
    title: str,
    subtitle: Optional[str] = None,
    content: Optional[str] = None,
    date: Optional[str] = None,
    location: Optional[str] = None,
    template: str = "default",
    width: int = 800,
    height: int = 1200
):
    """
    GET /api/v1/export/image
    
    通过 URL 参数生成图片（便于测试和直接嵌入）
    
    示例:
    /api/v1/export/image?title=上海三月市集&subtitle=春日限定&date=3月15-17日
    """
    try:
        from app.core.image_generator import generate_image
        
        image_bytes = await generate_image(
            title=title,
            subtitle=subtitle,
            content=content,
            date=date,
            location=location,
            template=template,
            width=width,
            height=height
        )
        
        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/png",
            headers={
                "Content-Disposition": f'inline; filename="rednote_{title[:20]}.png"'
            }
        )
        
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Playwright 未安装"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"图片生成失败: {str(e)}"
        )


@router.post("/image/from-template")
async def generate_image_from_template(request: GenerateFromTemplateRequest):
    """
    POST /api/v1/export/image/from-template
    
    基于 Magnes 模板生成图片
    
    示例请求:
    ```json
    {
        "template_id": "template-1773666891013",
        "events": [
            {
                "title": "外滩国际面包节",
                "date": "3月14-15日、3月21-22日",
                "venue": "BFC外滩枫径",
                "price": "免费",
                "description": "200+面包店出摊"
            },
            {
                "title": "超级美好面包节",
                "date": "3月12日-15日",
                "venue": "上海万象城",
                "price": "免费",
                "description": "150家品牌参与"
            },
            {
                "title": "海派法式生活节",
                "date": "3月13日-15日",
                "venue": "新天地时尚二期",
                "price": "免费",
                "description": "生活方式市集"
            }
        ],
        "return_type": "file"
    }
    ```
    """
    try:
        from app.core.image_generator import get_generator
        
        generator = await get_generator()
        
        # 使用模板生成图片
        image_bytes = await generator.generate_from_magnes_template(
            template_id=request.template_id,
            events=request.events,
            width=request.width,
            height=request.height
        )
        
        if request.return_type == "base64":
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            return JSONResponse(content={
                "status": "success",
                "message": "图片生成成功",
                "image_base64": f"data:image/png;base64,{image_base64}",
                "width": request.width,
                "height": request.height
            })
        else:
            safe_filename = "pink_template_events"
            return StreamingResponse(
                io.BytesIO(image_bytes),
                media_type="image/png",
                headers={
                    "Content-Disposition": f"inline; filename=\"{safe_filename}.png\""
                }
            )
            
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Playwright 未安装"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"图片生成失败: {str(e)}"
        )
