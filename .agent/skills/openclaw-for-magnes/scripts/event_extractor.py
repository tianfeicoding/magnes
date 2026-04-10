#!/usr/bin/env python3
"""
活动提取器 - 按照 Magnes 后端设计
从所有笔记中提取活动（合集拆分为子活动），按规则选择 Top 3

流程：
1. 从所有笔记中提取活动
2. 合集笔记拆分为子活动
3. 非合集笔记作为独立活动
4. 按类型（市集优先）和信息完整度排序
5. 选择 Top 3
"""

import json
import re
from typing import List, Dict
from pathlib import Path


class 活动项:
    """活动项 - 包含完整信息"""
    def __init__(self):
        self.name = ""           # 活动名称
        self.date = ""           # 时间
        self.venue = ""          # 场地
        self.price = ""          # 票价（默认免费）
        self.description = ""    # 描述
        self.type = ""           # 类型：market/exhibition/other
        self.source = ""         # 来源：独立笔记/合集子活动


def 提取所有活动(笔记列表: List[Dict]) -> List[活动项]:
    """
    从所有笔记中提取活动
    
    规则：
    - 合集笔记（包含多个日期或序号）拆分为子活动
    - 非合集笔记作为独立活动
    """
    all_events = []
    
    for 笔记 in 笔记列表:
        detail = 笔记.get('detail', {})
        note = detail.get('note', {}) if detail else {}
        
        title = note.get('title', '')
        desc = note.get('desc', '')
        text = title + '\n' + desc
        
        # 检测是否是合集笔记
        date_count = len(re.findall(r'\d{1,2}[\.\-/月]\d{1,2}', text))
        has_numbers = bool(re.search(r'(?:^|\n)\s*\d+[\.\、\s]', text))
        
        if date_count >= 3 or has_numbers:
            # 合集笔记 - 拆分为子活动
            子活动列表 = 拆分子活动(text)
            for 子活动文本 in 子活动列表:
                活动 = 提取活动字段(子活动文本)
                if 活动 and len(活动.name) > 5:
                    活动.source = "合集子活动"
                    # 过滤掉合集标题本身
                    if not any(x in 活动.name for x in ['上海|', '上海周末', '上海三月', '好逛又好玩', '上海真不缺']):
                        all_events.append(活动)
        else:
            # 非合集笔记 - 作为独立活动
            活动 = 活动项()
            活动.name = 清理活动名称(title)
            活动.date = 提取时间(text)
            活动.venue = 提取场地(text)
            活动.price = 提取票价(text) or "免费"
            活动.description = 提取描述(desc)
            活动.type = 判断活动类型(title + desc)
            活动.source = "独立笔记"
            
            if len(活动.name) > 5:
                all_events.append(活动)
    
    return all_events


def 拆分子活动(文本: str) -> List[str]:
    """按序号拆分子活动"""
    # 模式1: 数字序号 (1. 2. 3. / 1、2、3、)
    parts = re.split(r'(?:^|\n)\s*(?:\d+[\.\、\s]|\d️⃣)', 文本)
    parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
    
    if len(parts) > 1:
        return parts[:6]  # 最多取6个
    
    # 模式2: 项目符号 (- * •)
    parts = re.split(r'(?:^|\n)\s*[-\*•]\s*', 文本)
    parts = [p.strip() for p in parts if p.strip() and len(p.strip()) > 10]
    
    return parts[:6]


def 提取活动字段(文本: str) -> 活动项:
    """提取单个活动的字段"""
    活动 = 活动项()
    
    lines = 文本.split('\n')
    活动.name = 清理活动名称(lines[0]) if lines else ""
    活动.date = 提取时间(文本)
    活动.venue = 提取场地(文本)
    活动.price = 提取票价(文本) or "免费"
    活动.description = 提取描述(' '.join(lines[1:2]) if len(lines) > 1 else 文本)
    活动.type = 判断活动类型(活动.name)
    
    return 活动


def 清理活动名称(名称: str) -> str:
    """清理活动名称"""
    # 移除 emoji
    名称 = re.sub(r'[👩🏻👨🏻👧🏻👦🏻🔛♻️🌸🎫🆓🎨✨📍💰🔥📚🍓❗️💪🏻🤤🎪🧩🎬🔮🍞]', '', 名称)
    # 移除话题标签
    名称 = re.sub(r'\[.*?\]', '', 名称)
    # 限制长度
    名称 = 名称.strip()[:35]
    return 名称


def 提取时间(文本: str) -> str:
    """提取时间"""
    模式 = r'\d{1,2}[\.\-/月]\d{1,2}(?:[\s~至-]*\d{1,2}[\.\-/月]?\d{0,2})?'
    匹配 = re.search(模式, 文本)
    return 匹配.group(0) if 匹配 else ""


def 提取场地(文本: str) -> str:
    """提取场地"""
    模式 = [
        r'(?:📍)?\s*((?:黄浦区|静安区|徐汇区|长宁区|普陀区|虹口区|杨浦区|浦东新区)[^\n，。！]{2,20})',
        r'(?:📍)?\s*(BFC外滩枫泾|淮海中路|南京东路|外滩|新天地|陆家嘴|延平路|枫泾路|四川北路|愚园路|衡山路)[^\n，。！]{0,10}',
    ]
    for p in 模式:
        匹配 = re.search(p, 文本)
        if 匹配:
            return 匹配.group(1).replace('📍', '').strip()
    return ""


def 提取票价(文本: str) -> str:
    """提取票价 - 默认免费"""
    匹配 = re.search(r'(免费|免门票|¥\d+|\d+元)', 文本, re.IGNORECASE)
    if 匹配:
        票价 = 匹配.group(1)
        if 票价.lower() in ['免门票', '0元']:
            return "免费"
        return 票价
    return "免费"  # 默认免费


def 提取描述(文本: str) -> str:
    """提取描述"""
    文本 = re.sub(r'[#【】\[\]📍💰🔛♻️🌸🎫🆓\[话题\]]', '', 文本)
    文本 = re.sub(r'\s+', ' ', 文本).strip()
    return 文本[:60]


def 判断活动类型(文本: str) -> str:
    """判断活动类型"""
    if any(kw in 文本 for kw in ['市集', 'Market', '面包节', '市场']):
        return "market"
    elif any(kw in 文本 for kw in ['展', 'Exhibition', '画廊']):
        return "exhibition"
    return "other"


def 选择Top3活动(活动列表: List[活动项]) -> List[活动项]:
    """
    选择 Top 3 活动
    
    排序规则：
    1. 市集类优先（+10分）
    2. 有时间信息（+3分）
    3. 有场地信息（+3分）
    4. 明确标注免费（+1分）
    """
    评分列表 = []
    
    for 活动 in 活动列表:
        分数 = 0
        if 活动.type == "market":
            分数 += 10
        if 活动.date:
            分数 += 3
        if 活动.venue:
            分数 += 3
        if 活动.price == "免费":
            分数 += 1
        
        评分列表.append((分数, 活动))
    
    # 按分数降序排序
    评分列表.sort(key=lambda x: x[0], reverse=True)
    
    # 返回前3个
    return [活动 for _, 活动 in 评分列表[:3]]


def 格式化为Magnes海报格式(活动列表: List[活动项]) -> List[Dict]:
    """格式化为 Magnes 海报模板格式"""
    结果 = []
    
    for i, 活动 in enumerate(活动列表, 1):
        # 清理场地
        场地 = 活动.venue.replace('免费🆓', '').replace('免门票🎫', '').strip()
        
        结果.append({
            "rank": i,
            "name": 活动.name,
            "date": 活动.date,
            "venue": 场地,
            "price": 活动.price,
            "description": 活动.description,
            "type": 活动.type,
            "source": 活动.source
        })
    
    return 结果


def 主函数(输入文件: str, 输出文件: str = None):
    """主函数"""
    print("=" * 60)
    print("🔍 活动提取器 - 按照 Magnes 后端设计")
    print("=" * 60)
    
    # 1. 读取数据
    with open(输入文件, 'r', encoding='utf-8') as f:
        数据 = json.load(f)
    
    print(f"\n📥 读取 {len(数据)} 条笔记")
    
    # 2. 提取所有活动
    所有活动 = 提取所有活动(数据)
    print(f"📊 提取 {len(所有活动)} 个活动")
    
    # 3. 统计
    市集数 = len([a for a in 所有活动 if a.type == "market"])
    展览数 = len([a for a in 所有活动 if a.type == "exhibition"])
    print(f"   - 市集类: {市集数}个")
    print(f"   - 展览类: {展览数}个")
    
    # 4. 选择 Top 3
    top3 = 选择Top3活动(所有活动)
    
    # 5. 格式化输出
    结果 = 格式化为Magnes海报格式(top3)
    
    # 6. 保存
    输出 = {
        "extraction_method": "magnes_backend_style",
        "selection_criteria": "market_priority_info_completeness",
        "total_events": len(所有活动),
        "market_count": 市集数,
        "exhibition_count": 展览数,
        "top3_events": 结果
    }
    
    if 输出文件:
        with open(输出文件, 'w', encoding='utf-8') as f:
            json.dump(输出, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 已保存到: {输出文件}")
    
    # 7. 打印结果
    print("\n" + "=" * 60)
    print("🏆 TOP 3 活动（Magnes 海报格式）")
    print("=" * 60)
    
    for 活动 in 结果:
        print(f"\n**活动 {活动['rank']}: {活动['name']}**")
        print(f"   类型: {'市集' if 活动['type'] == 'market' else '展览'}")
        print(f"   🗓️ 时间: {活动['date'] or '-'}")
        print(f"   📍 场地: {活动['venue'] or '-'}")
        print(f"   💰 票价: {活动['price']}")
        print(f"   📝 描述: {活动['description'] or '-'}")
    
    return 结果


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python event_extractor.py <输入文件> [输出文件]")
        print("示例: python event_extractor.py shanghai_march_markets_top10_details.json top3_events.json")
        sys.exit(1)
    
    输入 = sys.argv[1]
    输出 = sys.argv[2] if len(sys.argv) > 2 else "top3_events.json"
    
    主函数(输入, 输出)
