#!/usr/bin/env python3
"""
本地海报生成器 - 使用手动调整的正确坐标
根据背景图片实际粉色块位置调整
"""

from PIL import Image, ImageDraw, ImageFont
import json
from pathlib import Path


# 手动调整后的正确坐标（根据背景图片粉色块实际位置）
# 调整后的坐标使文字更好地居中在粉色块内
CORRECT_POSITIONS = [
    # 活动1 - 最上方粉色块
    {
        "title": {"x": 120, "y": 140, "size": 35},
        "date": {"x": 120, "y": 190, "size": 25},
        "venue": {"x": 120, "y": 225, "size": 25},
        "price": {"x": 120, "y": 260, "size": 25},
        "description": {"x": 120, "y": 295, "size": 25}
    },
    # 活动2 - 中间粉色块
    {
        "title": {"x": 120, "y": 420, "size": 35},
        "date": {"x": 120, "y": 470, "size": 25},
        "venue": {"x": 120, "y": 505, "size": 25},
        "price": {"x": 120, "y": 540, "size": 25},
        "description": {"x": 120, "y": 575, "size": 25}
    },
    # 活动3 - 最下方粉色块
    {
        "title": {"x": 120, "y": 700, "size": 35},
        "date": {"x": 120, "y": 750, "size": 25},
        "venue": {"x": 120, "y": 785, "size": 25},
        "price": {"x": 120, "y": 820, "size": 25},
        "description": {"x": 120, "y": 855, "size": 25}
    }
]


def 生成海报(活动列表: list, 输出路径: str):
    """生成海报"""
    
    print("🎨 本地海报生成器 - 使用手动调整的正确坐标")
    print("=" * 60)
    
    # 1. 加载背景图片
    背景路径 = "data/pink_template_bg.jpg"
    try:
        图片 = Image.open(背景路径)
        宽度, 高度 = 图片.size
        print(f"✅ 背景图片: {宽度}x{高度}")
    except:
        # 如果背景图片不存在，创建粉色背景
        宽度, 高度 = 896, 1200
        图片 = Image.new('RGB', (宽度, 高度), color='#FFE4E1')
        print(f"⚠️ 使用默认粉色背景: {宽度}x{高度}")
    
    绘制 = ImageDraw.Draw(图片)
    
    # 2. 加载字体
    try:
        标题字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 35)
        正文字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 25)
    except Exception as e:
        print(f"⚠️ 字体加载失败: {e}")
        标题字体 = ImageFont.load_default()
        正文字体 = ImageFont.load_default()
    
    # 3. 绘制三个活动
    for i, 活动 in enumerate(活动列表[:3]):
        位置 = CORRECT_POSITIONS[i]
        print(f"\n   绘制活动 {i+1}: {活动['name'][:25]}")
        
        # 绘制每个字段
        for 字段名, 字段配置 in [
            ("title", 活动.get("name", "")),
            ("date", 活动.get("date", "")),
            ("venue", 活动.get("venue", "")),
            ("price", 活动.get("price", "")),
            ("description", 活动.get("description", ""))
        ]:
            if 字段配置 and 字段名 in 位置:
                配置 = 位置[字段名]
                x, y = 配置["x"], 配置["y"]
                
                # 选择字体
                if 字段名 == "title":
                    字体 = 标题字体
                    颜色 = "#6B4A2F"  # 棕色
                else:
                    字体 = 正文字体
                    颜色 = "#6B4A2F"
                
                # 截断文本
                最大长度 = 35 if 字段名 == "title" else 40
                if len(字段配置) > 最大长度:
                    显示文本 = 字段配置[:最大长度-2] + "..."
                else:
                    显示文本 = 字段配置
                
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
    输出路径 = "data/poster_final_correct.png"
    生成海报(活动列表, 输出路径)


if __name__ == "__main__":
    主函数()
