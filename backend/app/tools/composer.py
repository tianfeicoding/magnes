from datetime import datetime
from app.schema.state import MagnesState
from app.tools.visual_analyzer import transform_to_magnes_schema

async def composer_node(state: MagnesState):
    """
    Layout Composer 节点：协议整合专家。
    职责：彻底缝合并行产生的数据资产。
    1. 接收 Refiner 的逻辑布局 (文字层)。
    2. 接收 Slicer 的物理切片 (图片层)。
    3. 接收 Painter 的 AI 背景。

    """
    # 识别是否为“仅提示词演化”模式 (无 Painter，无 Slicer)
    is_pure_evolve = state.get("run_style_evolve") and not state.get("run_painter")
    
    if not is_pure_evolve:
        print(f"--- [Layout Composer] 启动跨并行链路数据融合 @ {datetime.now()} ---")
    
    # 1. 获取 Refiner 产出的文字布局和风格
    layout_schema = state.get("layout_schema", {})
    if not layout_schema:
        # 如果 Refiner 失败了，我们创建一个基础画布
        layout_schema = {"canvas": {"width": 1000, "height": 1333}, "layers": []}
        
    final_layers = [dict(l) for l in layout_schema.get("layers", [])]
    
    # 2. 获取 Slicer 产出的物理图片资产
    visual_assets = state.get("visual_assets", [])
    if visual_assets:
        if not is_pure_evolve:
            print(f"[Layout Composer] 检测到并行链路产出的 {len(visual_assets)} 个物理切片，正在转换协议...")
        # 利用 transform 工具将 URL 列表转化为标准的 Image 图层
        physical_layout = transform_to_magnes_schema({"layers": visual_assets})
        physical_layers = physical_layout.get("layers", [])
        
        # 将物理层插入到文字层之下
        final_layers = physical_layers + final_layers
    
    # 3. 获取 Painter 产出的 AI 扩图背景
    background_url = state.get("background_url")
    if background_url:
        if not is_pure_evolve:
            print(f"[Layout Composer] 检测到 AI 扩图背景，正在注入底层...")
        ai_bg_layer = {
            "id": "ai_background",
            "type": "image",
            "url": background_url,
            "role": "ai_background",
            "label": "AI 扩图背景",
            "bbox": [0, 0, 1000, 1333],
            "z_index": -100, 
            "opacity": 1.0
        }
        # 插入到最底层
        final_layers.insert(0, ai_bg_layer)

    # 更新最终 schema
    layout_schema["layers"] = final_layers

    # 仅在非纯演化模式下打印完成日志，或者演化模式下仅做简短确认
    has_meaningful_assets = (
        (layout_schema.get("layers") and len(layout_schema["layers"]) > 0) or 
        len(visual_assets) > 0 or 
        background_url is not None
    )
    
    if is_pure_evolve:
        print(f"[Layout Composer] 提示词演化背景同步完成 (跳过物理融合)")
    elif has_meaningful_assets:
        print(f"[Layout Composer] 融合完成！最终输出包含物理资产与逻辑坐标的完整协议")
    
    return {
        "layout_schema": layout_schema,
        "current_step": "composing_completed",
        "style_evolution": state.get("style_evolution", [])  # 保留 style_evolution
    }
