#!/usr/bin/env python3
"""
本地海报生成器 - 使用归一化坐标转换
Magnes 模板使用归一化坐标 (0-1000)，需要转换为实际像素坐标
"""

from PIL import Image, ImageDraw, ImageFont
import json


# 模板数据库中的归一化坐标 (0-1000)
# 微调后的坐标，使文字更好地居中在粉色块内
NORMALIZED_COORDS = [
    # 活动1
    {
        "title": [120, 125],
        "date": [120, 185],
        "venue": [120, 220],
        "price": [120, 255],
        "description": [120, 290]
    },
    # 活动2
    {
        "title": [120, 425],
        "date": [120, 490],
        "venue": [120, 525],
        "price": [120, 560],
        "description": [120, 595]
    },
    # 活动3
    {
        "title": [120, 715],
        "date": [120, 780],
        "venue": [120, 815],
        "price": [120, 850],
        "description": [120, 885]
    }
]


def 归一化转像素(coord, img_width, img_height, ref_width=1000, ref_height=1333):
    """
    将归一化坐标 (0-1000) 转换为实际像素坐标
    
    Args:
        coord: [x, y] 归一化坐标
        img_width: 实际图片宽度
        img_height: 实际图片高度
        ref_width: 参考宽度 (默认1000)
        ref_height: 参考高度 (默认1333)
    """
    x = int(coord[0] * img_width / ref_width)
    y = int(coord[1] * img_height / ref_height)
    return [x, y]


def 生成海报(活动列表, 输出路径):
    """生成海报"""
    
    print("🎨 本地海报生成器 - 使用归一化坐标转换")
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
        归一化位置 = NORMALIZED_COORDS[i]
        print(f"\n   绘制活动 {i+1}: {活动['name'][:25]}")
        
        for 字段名, 字段值 in [
            ("title", 活动.get("name", "")),
            ("date", 活动.get("date", "")),
            ("venue", 活动.get("venue", "")),
            ("price", 活动.get("price", "")),
            ("description", 活动.get("description", ""))
        ]:
            if 字段值 and 字段名 in 归一化位置:
                # 转换坐标
                像素坐标 = 归一化转像素(归一化位置[字段名], 宽度, 高度)
                x, y = 像素坐标
                
                # 选择字体
                if 字段名 == "title":
                    字体 = 标题字体
                    颜色 = "#6B4A2F"
                    最大长度 = 30
                else:
                    字体 = 正文字体
                    颜色 = "#6B4A2F"
                    最大长度 = 40
                
                # 截断文本
                if len(字段值) > 最大长度:
                    显示文本 = 字段值[:最大长度-2] + "..."
                else:
                    显示文本 = 字段值
                
                # 绘制文本
                绘制.text((x, y), 显示文本, font=字体, fill=颜色)
                print(f"      {字段名}: 归一化{归一化位置[字段名]} -> 像素({x}, {y}) {显示文本[:15]}")
    
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
    输出路径 = "data/poster_normalized_coords.png"
    生成海报(活动列表, 输出路径)


if __name__ == "__main__":
    主函数()
