"""
Segment Routes - 图像分割与遮罩合成 API
提供自动抠图、手动 mask 合成等接口
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from app.agents.experts.segment import auto_segment, composite_image, semantic_segment
from app.agents.experts.sam.mobilesam_segment import mobilesam_segment
from app.core.users import current_user
from app.models.user import User

router = APIRouter(prefix="/segment", tags=["Segment 图像分割"])


class AutoSegmentRequest(BaseModel):
    image_url: str = Field(..., description="待抠图的图片 URL 或 base64")


class AutoSegmentResponse(BaseModel):
    mask_url: str = Field(..., description="生成的遮罩图（白=保留，黑=镂空）")
    preview_url: str = Field(..., description="抠图后的预览图")


class SemanticSegmentRequest(BaseModel):
    image_url: str = Field(..., description="待分析的图片 URL 或 base64")
    prompt: str = Field(..., description="用户描述想提取的区域，如'保留相框边框'、'左边的人'")


class SemanticSegmentResponse(BaseModel):
    mask_url: str = Field(..., description="生成的遮罩图（白=保留，黑=镂空）")
    preview_url: str = Field(..., description="抠图后的预览图")
    description: str = Field("", description="模型识别的区域描述")


class CompositeRequest(BaseModel):
    base_url: str = Field(..., description="底图 URL 或 base64")
    mask_data: str = Field(..., description="遮罩图 URL 或 base64（白=保留，黑=镂空）")
    fill_url: str = Field(..., description="填充图 URL 或 base64")
    offset_x: int = Field(0, description="填充图水平偏移")
    offset_y: int = Field(0, description="填充图垂直偏移")
    feather: int = Field(0, description="边缘羽化像素（0=无羽化）")


class CompositeResponse(BaseModel):
    composite_url: str = Field(..., description="合成后的图片")
    dimensions: dict = Field({}, description="图片尺寸")


@router.post("/auto", response_model=AutoSegmentResponse)
async def segment_auto(
    request: AutoSegmentRequest,
    user: User = Depends(current_user)
):
    """
    自动抠图：智能识别主体并生成遮罩（rembg 轻量模式）
    """
    try:
        result = await auto_segment(request.image_url)
        return AutoSegmentResponse(**result)
    except Exception as e:
        print(f"[Segment Auto] 抠图失败: {e}")
        raise HTTPException(status_code=500, detail=f"抠图失败: {str(e)}")


@router.post("/semantic", response_model=SemanticSegmentResponse)
async def segment_semantic(
    request: SemanticSegmentRequest,
    user: User = Depends(current_user)
):
    """
    语义抠图：根据用户自然语言描述提取图片中的特定区域（大模型模式）
    适用于复杂语义场景，如相框提取、指定人物、特定物体等
    """
    try:
        result = await semantic_segment(request.image_url, request.prompt)
        return SemanticSegmentResponse(**result)
    except RuntimeError as e:
        print(f"[Segment Semantic] 语义分割失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Segment Semantic] 未知错误: {e}")
        raise HTTPException(status_code=500, detail=f"语义分割失败: {str(e)}")


@router.post("/composite", response_model=CompositeResponse)
async def segment_composite(
    request: CompositeRequest,
    user: User = Depends(current_user)
):
    """
    手动遮罩合成：将填充图放入底图的镂空区域
    """
    try:
        result = await composite_image(
            base_url=request.base_url,
            mask_data=request.mask_data,
            fill_url=request.fill_url,
            offset_x=request.offset_x,
            offset_y=request.offset_y,
            feather=request.feather,
        )
        return CompositeResponse(**result)
    except Exception as e:
        print(f"[Segment Composite] 合成失败: {e}")
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


class MobileSAMRequest(BaseModel):
    image_url: str = Field(..., description="待分割的图片 URL 或 base64")
    point_coords: Optional[list] = Field(None, description="点提示坐标，归一化 [[x,y], ...]")
    box: Optional[list] = Field(None, description="框提示坐标，归一化 [x1,y1,x2,y2]")


class MobileSAMResponse(BaseModel):
    mask_url: str = Field(..., description="生成的遮罩图（白=保留，黑=镂空）")
    preview_url: str = Field(..., description="分割后的预览图")
    mode: str = Field("mobilesam", description="使用的分割模式: mobilesam | grabcut")


@router.post("/mobilesam", response_model=MobileSAMResponse)
async def segment_mobilesam(
    request: MobileSAMRequest,
    user: User = Depends(current_user)
):
    """
    MobileSAM 交互式分割：支持点选或框选提示，自动追踪精确边缘
    无 GPU 时自动降级为 Grabcut
    """
    if not request.point_coords and not request.box:
        raise HTTPException(status_code=400, detail="需要提供 point_coords 或 box")

    try:
        result = await mobilesam_segment(
            image_url=request.image_url,
            point_coords=request.point_coords,
            box=request.box,
        )
        return MobileSAMResponse(**result, mode=result.get("mode", "mobilesam"))
    except RuntimeError as e:
        print(f"[MobileSAM] 分割失败: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[MobileSAM] 未知错误: {e}")
        raise HTTPException(status_code=500, detail=f"分割失败: {str(e)}")
