#!/usr/bin/env python3
"""
总结市集信息
用于 openclaw-for-magnes 技能
"""

import json
import sys
import re
from datetime import datetime
from pathlib import Path


def 提取市集信息(笔记详情: dict) -> dict:
    """从笔记详情中提取市集信息
    
    参数:
        笔记详情: 笔记详情字典
        
    返回:
        市集信息字典
    """
    笔记 = 笔记详情.get("note", {})
    
    标题 = 笔记.get("title", "")
    描述 = 笔记.get("desc", "")
    
    # 提取时间
    时间模式 = [
        r'(\d{1,2})\s*月\s*(\d{1,2})\s*日?[\s~至-]*(\d{1,2})?\s*日?',
        r'(\d{4}[\.\-/])?\d{1,2}[\.\-/]\d{1,2}',
        r'\d{1,2}\.\d{1,2}[\s~至-]*\d{1,2}\.\d{1,2}',
    ]
    
    时间 = ""
    for 模式 in 时间模式:
        匹配 = re.search(模式, 标题 + " " + 描述)
        if 匹配:
            时间 = 匹配.group(0)
            break
    
    # 提取地点
    地点模式 = [
        r'📍\s*([^\n]+)',
        r'地点[：:]\s*([^\n]+)',
        r'地址[：:]\s*([^\n]+)',
        r'(?:在|位于)\s*([\u4e00-\u9fa5]{2,}(?:路|街|区|中心|广场|馆)[^\n]*)',
    ]
    
    地点 = ""
    for 模式 in 地点模式:
        匹配 = re.search(模式, 标题 + " " + 描述)
        if 匹配:
            地点 = 匹配.group(1).strip()
            break
    
    # 提取亮点（使用描述的前80字）
    亮点 = 描述[:80] + "..." if len(描述) > 80 else 描述
    
    # 提取图片
    图片列表 = 笔记.get("imageList", [])
    图片 = [图片.get("urlDefault", "") for 图片 in 图片列表[:3]]
    
    return {
        "name": 标题,
        "date": 时间,
        "location": 地点,
        "highlight": 亮点,
        "audience": "",
        "images": 图片
    }


def 总结市集信息(搜索文件: str, 数量: int = 6) -> dict:
    """总结市集信息
    
    参数:
        搜索文件: 搜索结果文件路径
        数量: 总结的市集数量
        
    返回:
        总结的市集信息字典
    """
    
    with open(搜索文件, 'r', encoding='utf-8') as f:
        数据 = json.load(f)
    
    笔记列表 = 数据.get("notes", [])
    关键词 = 数据.get("keyword", "")
    
    # 选择互动数据最好的 N 条
    排序笔记 = sorted(
        笔记列表,
        key=lambda x: int(x.get("interactInfo", {}).get("likedCount", "0") or "0"),
        reverse=True
    )
    
    市集列表 = []
    for 序号, 笔记 in enumerate(排序笔记[:数量], 1):
        详情 = 笔记.get("detail", {})
        if not 详情:
            continue
        
        市集信息 = 提取市集信息(详情)
        市集信息["index"] = 序号
        市集信息["source_note_id"] = 笔记.get("id", "")
        市集信息["liked_count"] = 笔记.get("interactInfo", {}).get("likedCount", "0")
        
        市集列表.append(市集信息)
    
    return {
        "summary_time": datetime.now().isoformat(),
        "source_file": 搜索文件,
        "keyword": 关键词,
        "event_count": len(市集列表),
        "events": 市集列表
    }


def 格式化为展示文本(市集数据: dict) -> str:
    """格式化为用户展示文本
    
    参数:
        市集数据: 市集数据字典
        
    返回:
        展示文本
    """
    市集列表 = 市集数据.get("events", [])
    
    行 = [f"📋 为你精选 {len(市集列表)} 个市集：\n"]
    
    for 市集 in 市集列表:
        行.append(f"**{市集['index']}. {市集['name']}**")
        
        if 市集['location']:
            行.append(f"📍 {市集['location']}")
        if 市集['date']:
            行.append(f"🗓️ {市集['date']}")
        if 市集['highlight']:
            行.append(f"✨ {市集['highlight']}")
        
        行.append("")
    
    行.append("─" * 40)
    行.append("\n🎨 是否需要生成海报？")
    行.append("回复「要」或指定市集（如「生成第1个的海报」）")
    
    return "\n".join(行)


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python summarize_events.py <搜索结果文件> [数量]")
        sys.exit(1)
    
    搜索文件 = sys.argv[1]
    数量 = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    
    print(f"📊 总结 {数量} 个市集信息...")
    print(f"  来源: {搜索文件}")
    
    结果 = 总结市集信息(搜索文件, 数量)
    
    # 保存结果
    时间戳 = datetime.now().strftime("%Y%m%d_%H%M%S")
    输出文件 = Path(f"data/summarized_events_{时间戳}.json")
    
    with open(输出文件, 'w', encoding='utf-8') as f:
        json.dump(结果, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 已保存到: {输出文件}")
    
    # 输出展示文本
    展示文本 = 格式化为展示文本(结果)
    print("\n" + 展示文本)
    
    # 输出文件路径
    print(f"\nOUTPUT_FILE:{输出文件}")


if __name__ == "__main__":
    主函数()
