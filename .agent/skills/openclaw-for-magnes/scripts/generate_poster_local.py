#!/usr/bin/env python3
"""
本地海报生成器 - 使用 Magnes 模板精确坐标
严格按照模板数据库中的 bbox 坐标生成海报
"""

import sqlite3
import json
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path


def 获取模板数据(模板id: str) -> dict:
    """从数据库获取模板数据"""
    db_path = "/Users/Hamilton/Desktop/rednote/magnes/backend/data/magnes.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT id, name, layout, atoms FROM templates WHERE id=?;",
        (模板id,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise ValueError(f"模板 {模板id} 不存在")
    
    tid, name, layout, atoms = row
    return {
        "id": tid,
        "name": name,
        "layout": json.loads(layout) if layout else [],
        "atoms": json.loads(atoms) if atoms else {}
    }


def 解析模板字段(布局数据: list) -> dict:
    """
    解析模板布局，提取字段坐标
    返回: {group_id: {role: {x, y, width, height, style}}}
    """
    字段映射 = {}
    
    for item in 布局数据:
        group_id = item.get("groupId", "default")
        role = item.get("semanticRole") or item.get("role", "unknown")
        
        if group_id not in 字段映射:
            字段映射[group_id] = {}
        
        # bbox: [x, y, width, height]
        bbox = item.get("bbox", [0, 0, 100, 30])
        
        字段映射[group_id][role] = {
            "x": bbox[0],
            "y": bbox[1],
            "width": bbox[2],
            "height": bbox[3],
            "style": item.get("style", {}),
            "text": item.get("text", "")
        }
    
    return 字段映射


def 生成海报(活动列表: list, 模板id: str, 输出路径: str):
    """生成海报"""
    
    # 1. 获取模板数据
    print(f"🎨 加载模板: {模板id}")
    模板 = 获取模板数据(模板id)
    字段映射 = 解析模板字段(模板["layout"])
    
    print(f"   模板名称: {模板['name']}")
    print(f"   字段组数: {len(字段映射)}")
    
    # 2. 加载背景图片
    背景路径 = "data/pink_template_bg.jpg"
    try:
        图片 = Image.open(背景路径)
        宽度, 高度 = 图片.size
        print(f"   背景图片: {宽度}x{高度}")
    except:
        # 如果背景图片不存在，创建粉色背景
        宽度, 高度 = 896, 1200
        图片 = Image.new('RGB', (宽度, 高度), color='#FFE4E1')
        print(f"   使用默认粉色背景: {宽度}x{高度}")
    
    绘制 = ImageDraw.Draw(图片)
    
    # 3. 加载字体
    try:
        # macOS 系统字体 - 使用支持中文的字体
        标题字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 35)
        正文字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 25)
        小字体 = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 20)
    except Exception as e:
        print(f"   ⚠️ 字体加载失败: {e}")
        # 回退到默认字体
        标题字体 = ImageFont.load_default()
        正文字体 = ImageFont.load_default()
        小字体 = ImageFont.load_default()
    
    # 4. 绘制三个活动
    活动组列表 = ["group_1", "group_2", "group_3"]
    
    for i, 活动 in enumerate(活动列表[:3]):
        组id = 活动组列表[i] if i < len(活动组列表) else f"group_{i+1}"
        
        if 组id not in 字段映射:
            print(f"   ⚠️ 未找到 {组id} 的字段映射")
            continue
        
        组字段 = 字段映射[组id]
        print(f"\n   绘制活动 {i+1}: {活动['name'][:20]}")
        
        # 绘制每个字段
        for 字段名, 字段值 in [
            ("title", 活动.get("name", "")),
            ("date", 活动.get("date", "")),
            ("venue", 活动.get("venue", "")),
            ("price", 活动.get("price", "")),
            ("description", 活动.get("description", ""))
        ]:
            if 字段名 in 组字段 and 字段值:
                字段信息 = 组字段[字段名]
                x, y = 字段信息["x"], 字段信息["y"]
                w, h = 字段信息["width"], 字段信息["height"]
                
                # 选择字体
                if 字段名 == "title":
                    字体 = 标题字体
                    颜色 = "#6B4A2F"  # 棕色
                else:
                    字体 = 正文字体
                    颜色 = "#6B4A2F"
                
                # 截断文本以适应宽度
                最大长度 = int(w / 15)  # 估算字符数
                if len(字段值) > 最大长度:
                    显示文本 = 字段值[:最大长度-2] + "..."
                else:
                    显示文本 = 字段值
                
                # 绘制文本
                # 标题稍微向下偏移，使其在粉色块内居中
                if 字段名 == "title":
                    y = y + 35  # 标题向下偏移35像素，使其在粉色块内
                绘制.text((x, y), 显示文本, font=字体, fill=颜色)
                print(f"      {字段名}: ({x}, {y}) {显示文本[:15]}")
    
    # 5. 保存
    图片.save(输出路径, "PNG")
    print(f"\n✅ 海报已保存: {输出路径}")
    print(f"   尺寸: {宽度}x{高度}")
    
    return 输出路径


def 主函数():
    import sys
    
    # 读取活动数据
    数据路径 = "/Users/Hamilton/.openclaw/workspace/data/xiaohongshu/top3_final.json"
    with open(数据路径, 'r') as f:
        数据 = json.load(f)
    
    活动列表 = 数据['top3_events']
    
    print("=" * 60)
    print("🎨 本地海报生成器 - 使用 Magnes 模板精确坐标")
    print("=" * 60)
    
    # 生成海报
    模板id = "template-1773666891013"
    输出路径 = "data/poster_local_correct.png"
    
    生成海报(活动列表, 模板id, 输出路径)


if __name__ == "__main__":
    主函数()
