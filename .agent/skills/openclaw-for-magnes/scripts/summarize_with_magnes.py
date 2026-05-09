#!/usr/bin/env python3
"""
使用本地语义提取（按照 Magnes 海报模板格式）进行活动总结
用于 openclaw-for-magnes 技能

Magnes 海报模板字段：
- title: 标题
- date: 时间
- venue: 场地
- price: 票价
- description: 活动描述
"""

import json
import sys
import httpx
import re
from datetime import datetime
from pathlib import Path

# 导入本地语义提取器
from semantic_extractor import 提取语义内容


MAGNES_API_URL = "http://localhost:8088"
MAGNES_API_TOKEN = "magnes_secure_token_2024"


def 调用语义提取(文本: str) -> dict:
    """调用 Magnes 后端语义提取 API（带本地回退）"""
    try:
        响应 = httpx.post(
            f"{MAGNES_API_URL}/api/v1/mcp/semantic/extract",
            json={"text": 文本},
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=5.0
        )
        响应.raise_for_status()
        return 响应.json()
    except Exception as e:
        # 本地回退
        print(f"  ⚠️ 使用本地提取")
        本地结果 = 提取语义内容(文本)
        return {"items": 本地结果}


def 批量模式识别(笔记列表: list) -> list:
    """批量模式识别 - 提取多个笔记的活动信息（Magnes 海报格式）"""
    活动列表 = []
    
    for 序号, 笔记 in enumerate(笔记列表, 1):
        详情 = 笔记.get('detail', {})
        if not 详情:
            continue
            
        笔记详情 = 详情.get('note', {})
        标题 = 笔记详情.get('title', '')
        描述 = 笔记详情.get('desc', '')
        
        print(f"\n[{序号}/{len(笔记列表)}] 处理: {标题[:25]}...")
        
        # 组合文本进行语义提取
        文本 = f"{标题}\n{描述}"
        
        # 调用语义提取
        语义结果 = 调用语义提取(文本)
        提取项列表 = 语义结果.get('items', [])
        
        # 使用第一个提取项作为主活动
        if 提取项列表:
            主项 = 提取项列表[0]
            活动信息 = {
                'index': 序号,
                'title': 主项.get('title', 标题),
                'date': 主项.get('date', ''),
                'venue': 主项.get('venue', ''),
                'price': 主项.get('price', ''),
                'description': 主项.get('description', 描述[:80]),
                'source_note_id': 笔记.get('id', ''),
                'liked_count': 笔记.get('interactInfo', {}).get('likedCount', '0'),
                'collected_count': 笔记.get('interactInfo', {}).get('collectedCount', '0'),
                'semantic_items': 提取项列表  # 保存所有提取的子活动
            }
            
            # 显示提取的子活动
            if len(提取项列表) > 1:
                print(f"  📦 提取到 {len(提取项列表)} 个子活动：")
                for i, 子项 in enumerate(提取项列表[:5], 1):  # 最多显示5个
                    子标题 = 子项.get('title', '未命名')[:20]
                    子时间 = 子项.get('date', '')
                    print(f"    {i}. {子标题} {子时间}")
        else:
            # 回退到基础提取
            活动信息 = {
                'index': 序号,
                'title': 标题,
                'date': 提取时间(描述),
                'venue': 提取场地(描述),
                'price': 提取票价(描述),
                'description': 描述[:80] + "..." if len(描述) > 80 else 描述,
                'source_note_id': 笔记.get('id', ''),
                'liked_count': 笔记.get('interactInfo', {}).get('likedCount', '0'),
                'collected_count': 笔记.get('interactInfo', {}).get('collectedCount', '0'),
                'semantic_items': []
            }
        
        # 提取图片
        图片列表 = 笔记详情.get('imageList', [])
        活动信息['images'] = [img.get('urlDefault', '') for img in 图片列表[:3]]
        
        活动列表.append(活动信息)
    
    return 活动列表


def 提取时间(文本: str) -> str:
    """提取时间"""
    时间模式 = [
        r'\d{1,2}[\.\-/月]\d{1,2}[\s~至-]*\d{1,2}[\.\-/月]?\d{0,2}',
        r'\d{1,2}\s*月\s*\d{1,2}\s*日?',
    ]
    for 模式 in 时间模式:
        匹配 = re.search(模式, 文本)
        if 匹配:
            return 匹配.group(0)
    return ""


def 提取场地(文本: str) -> str:
    """提取场地"""
    场地模式 = [
        r'📍\s*([^\n，。]{2,20})',
        r'(淮海中路|静安区|黄浦区|外滩|四川北路|延平路|枫泾路)([^\n，。]{0,10})',
    ]
    for 模式 in 场地模式:
        匹配 = re.search(模式, 文本)
        if 匹配:
            return 匹配.group(0).replace('📍', '').strip()[:20]
    return ""


def 提取票价(文本: str) -> str:
    """提取票价"""
    票价模式 = [
        r'(免费|free|Free|0元|免票|免门票)',
        r'(\d+)\s*元',
    ]
    for 模式 in 票价模式:
        匹配 = re.search(模式, 文本, re.IGNORECASE)
        if 匹配:
            票价 = 匹配.group(0)
            if '免费' in 票价 or 'free' in 票价.lower() or '0元' in 票价 or '免票' in 票价:
                return "免费"
            return 票价
    return ""


def 格式化为展示文本(活动数据: dict) -> str:
    """格式化为用户展示文本（Magnes 海报格式）"""
    活动列表 = 活动数据.get('events', [])
    
    行 = [f"📋 为你精选 {len(活动列表)} 个市集（Magnes 海报格式）：\n"]
    
    for 活动 in 活动列表:
        行.append(f"**{活动['index']}. {活动['title']}**")
        
        # Magnes 海报模板字段
        if 活动.get('date'):
            行.append(f"🗓️ 时间: {活动['date']}")
        if 活动.get('venue'):
            行.append(f"📍 场地: {活动['venue']}")
        if 活动.get('price'):
            行.append(f"💰 票价: {活动['price']}")
        if 活动.get('description'):
            行.append(f"📝 活动描述: {活动['description']}")
        
        # 互动数据
        行.append(f"👍 {活动.get('liked_count', '0')} | ⭐ {活动.get('collected_count', '0')}")
        
        # 子活动数量
        子活动数 = len(活动.get('semantic_items', []))
        if 子活动数 > 1:
            行.append(f"📦 包含 {子活动数} 个子活动")
        
        行.append("")
    
    行.append("─" * 40)
    行.append("\n🎨 是否需要生成海报？")
    行.append("回复「要」或指定市集（如「生成第1个的海报」）")
    
    return "\n".join(行)


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python summarize_with_magnes.py <搜索结果文件> [数量]")
        sys.exit(1)
    
    搜索文件 = sys.argv[1]
    数量 = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    
    print(f"📊 使用 Magnes 海报格式总结 {数量} 个市集...")
    print(f"  来源: {搜索文件}")
    
    # 读取搜索结果
    with open(搜索文件, 'r', encoding='utf-8') as f:
        数据 = json.load(f)
    
    # 处理不同格式
    if isinstance(数据, list):
        笔记列表 = 数据[:数量]
        关键词 = "上海三月热门市集"
    else:
        笔记列表 = 数据.get('notes', [])[:数量]
        关键词 = 数据.get('keyword', '')
    
    print(f"  共 {len(笔记列表)} 条笔记待处理")
    
    # 批量模式识别
    活动列表 = 批量模式识别(笔记列表)
    
    # 构建结果
    结果 = {
        'summary_time': datetime.now().isoformat(),
        'source_file': 搜索文件,
        'keyword': 关键词,
        'event_count': len(活动列表),
        'extraction_method': 'magnes_poster_format',
        'format_fields': ['title', 'date', 'venue', 'price', 'description'],
        'events': 活动列表
    }
    
    # 保存结果
    时间戳 = datetime.now().strftime("%Y%m%d_%H%M%S")
    输出文件 = Path(f"data/summarized_events_magnes_{时间戳}.json")
    
    with open(输出文件, 'w', encoding='utf-8') as f:
        json.dump(结果, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已保存到: {输出文件}")
    
    # 输出展示文本
    展示文本 = 格式化为展示文本(结果)
    print("\n" + 展示文本)
    
    # 输出文件路径
    print(f"\nOUTPUT_FILE:{输出文件}")


if __name__ == "__main__":
    主函数()
