#!/usr/bin/env python3
"""
本地海报生成器 - 使用精确的粉色块位置
根据背景图片实际检测到的粉色块位置调整坐标
"""

from PIL import Image, ImageDraw, ImageFont
import json
import re


# 根据背景图片检测到的粉色块精确位置
# 每个块包含: title, date, venue, price, description
# 视觉审查后调整的最佳坐标
BLOCK_POSITIONS = [
    # Block 2 - 第一个活动 (Y=117 到 Y=393)
    {
        "block_top": 117,
        "block_bottom": 393,
        "title": {"x": 200, "y": 165},
        "date": {"x": 200, "y": 215},
        "venue": {"x": 200, "y": 255},
        "price": {"x": 200, "y": 295},
        "description": {"x": 200, "y": 335}
    },
    # Block 3 - 第二个活动 (Y=471 到 Y=731)
    {
        "block_top": 471,
        "block_bottom": 731,
        "title": {"x": 200, "y": 520},
        "date": {"x": 200, "y": 570},
        "venue": {"x": 200, "y": 610},
        "price": {"x": 200, "y": 650},
        "description": {"x": 200, "y": 690}
    },
    # Block 4 - 第三个活动 (Y=808 到 Y=1097)
    {
        "block_top": 808,
        "block_bottom": 1097,
        "title": {"x": 200, "y": 860},
        "date": {"x": 200, "y": 910},
        "venue": {"x": 200, "y": 950},
        "price": {"x": 200, "y": 990},
        "description": {"x": 200, "y": 1030}
    }
]


def 清理标题(标题: str) -> str:
    """清理标题中的日期和时间信息"""
    # 先移除时间模式 (如 "11:00-18:00", "11:00-2")
    标题 = re.sub(r'\s*\d+:\d+(-\d+:\d+)?\s*', ' ', 标题)
    # 移除日期模式 (如 "3.1-3.3", "3.1-3.3&3.9-3.10", "3.16-3.17&3.23-3.24")
    标题 = re.sub(r'\s*\d+\.\d+(-\d+\.\d+)?(&\d+\.\d+(-\d+\.\d+)?)?\s*', ' ', 标题)
    # 移除残留的 "-2" 等
    标题 = re.sub(r'\s+-\d+\s*$', '', 标题)
    # 清理多余空格
    标题 = re.sub(r'\s+', ' ', 标题).strip()
    return 标题


def 生成海报(活动列表, 输出路径):
    """生成海报"""
    
    print("🎨 本地海报生成器 - 使用精确的粉色块位置")
    print("=" * 60)
    
    # 1. 加载背景图片
    背景路径 = "data/pink_template_bg.jpg"
    try:
        图片 = Image.open(背景路径)
        宽度, 高度 = 图片.size
        print(f"✅ 背景图片: {宽度}x{高度}")
    except:
        宽度, 高度 = 896, 1200
        图片 = Image.new('RGB', (宽度, 高度), color='#FFE4E1')
        print(f"⚠️ 使用默认粉色背景: {宽度}x{高度}")
    
    绘制 = ImageDraw.Draw(图片)
    
    # 2. 加载字体
    try:
        标题字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 32)
        正文字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 22)
    except Exception as e:
        print(f"⚠️ 字体加载失败: {e}")
        标题字体 = ImageFont.load_default()
        正文字体 = ImageFont.load_default()
    
    # 3. 绘制三个活动
    for i, 活动 in enumerate(活动列表[:3]):
        位置 = BLOCK_POSITIONS[i]
        
        # 清理标题（移除日期时间）
        原始标题 = 活动.get("name", "")
        清理后标题 = 清理标题(原始标题)
        
        print(f"\n   绘制活动 {i+1}:")
        print(f"      原始标题: {原始标题[:40]}")
        print(f"      清理后: {清理后标题[:40]}")
        
        # 绘制每个字段
        for 字段名, 字段值 in [
            ("title", 清理后标题),
            ("date", 活动.get("date", "")),
            ("venue", 活动.get("venue", "")),
            ("price", 活动.get("price", "")),
            ("description", 活动.get("description", ""))
        ]:
            if 字段值 and 字段名 in 位置:
                坐标 = 位置[字段名]
                x, y = 坐标["x"], 坐标["y"]
                
                # 检查是否在粉色块内
                if y < 位置["block_top"] or y > 位置["block_bottom"] - 30:
                    print(f"      ⚠️ {字段名} 位置可能超出粉色块")
                
                # 选择字体
                if 字段名 == "title":
                    字体 = 标题字体
                    颜色 = "#6B4A2F"
                    最大长度 = 25
                else:
                    字体 = 正文字体
                    颜色 = "#6B4A2F"
                    最大长度 = 35
                
                # 截断文本
                if len(字段值) > 最大长度:
                    显示文本 = 字段值[:最大长度-2] + "..."
                else:
                    显示文本 = 字段值
                
                # 绘制文本
                绘制.text((x, y), 显示文本, font=字体, fill=颜色)
                print(f"      {字段名}: ({x}, {y}) {显示文本[:20]}")
    
    # 4. 保存
    图片.save(输出路径, "PNG")
    print(f"\n✅ 海报已保存: {输出路径}")
    print(f"   尺寸: {宽度}x{高度}")
    
    return 输出路径


def 主函数():
    # 读取活动数据
    数据路径 = "/Users/Hamilton/.openclaw/workspace/data/xiaohongshu/top3_final.json"
    with open(数据路径, 'r') as f:
        数据 = json.load(f)
    
    活动列表 = 数据['top3_events']
    
    # 生成海报
    输出路径 = "data/poster_precise_blocks.png"
    生成海报(活动列表, 输出路径)


if __name__ == "__main__":
    主函数()
