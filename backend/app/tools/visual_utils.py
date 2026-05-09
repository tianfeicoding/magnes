"""
Visual Utils
视觉计算辅助工具集。
提供坐标归一化 (Normalize BBox) 以及从视觉分析结果计算 Magnes 协议布局的核心算法。
"""
# backend/app/tools/visual_utils.py

def normalize_bbox(raw_bbox, original_size, target_norm=1000):
    """
    将原始像素坐标转换为 [0, 1000] 的归一化坐标。
    original_size: (width, height)
    """
    w, h = original_size
    x, y, rect_w, rect_h = raw_bbox
    
    return [
        int(x / w * target_norm),
        int(y / h * target_norm),
        int(rect_w / w * target_norm),
        int(rect_h / h * target_norm)
    ]

def calculate_magnes_layout(image_analysis_result):
    """
    核心排版计算逻辑（从 JS 迁移至此）。
    根据 AI 对参考图的分析结果，生成 Magnes 0-1000 协议。
    """
    # 假设分析结果告诉我们：
    # 1. 这里有一张背景图
    # 2. 顶部有一个主要标题
    
    # 我们按照小红书 3:4 的标准画布进行归一化计算
    # 在 Python 中处理这些逻辑比 JS 更有利于扩展（如接入 OpenCV 进行边缘检测）
    
    layout = {
        "canvas": {"width": 1000, "height": 1333},
        "layers": [
            {
                "id": "bg_layer",
                "type": "image",
                "bbox": [0, 0, 1000, 1333],
                "z_index": 0,
                "role": "background",
                "is_original": True
            },
            {
                "id": "title_layer",
                "type": "text",
                "bbox": [150, 200, 700, 120], # 归一化坐标
                "z_index": 10,
                "role": "main_title",
                "default_text": "点击输入主标题"
            }
        ]
    }
    
    return layout
