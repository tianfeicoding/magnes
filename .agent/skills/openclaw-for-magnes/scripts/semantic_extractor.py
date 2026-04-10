#!/usr/bin/env python3
"""
本地语义提取服务 - 按照 Magnes 海报模板格式提取
用于 openclaw-for-magnes 技能

Magnes 海报模板字段：
- title: 标题
- date: 时间
- venue: 场地
- price: 票价
- description: 活动描述
"""

import re
from typing import List, Dict


class 海报活动项:
    """海报活动项 - 适配 Magnes 模板格式"""
    def __init__(self):
        self.title = ""           # 标题
        self.date = ""            # 时间
        self.venue = ""           # 场地
        self.price = ""           # 票价
        self.description = ""     # 活动描述


def 提取语义内容(文本: str) -> List[Dict]:
    """
    提取结构化文案 - 按照 Magnes 海报模板格式
    
    核心能力：
    1. 活动提取：从长文本中识别并拆分出多个独立的活动项
    2. 字段映射：提取标题、时间、场地、票价、活动描述
    
    参数:
        文本: 输入文本
        
    返回:
        解析出的内容列表，每项包含：
        - title: 标题
        - date: 时间
        - venue: 场地
        - price: 票价
        - description: 活动描述
    """
    
    # 1. 尝试拆分多个活动
    活动列表 = 拆分多个活动(文本)
    
    # 2. 如果没有拆分出多个，作为一个整体处理
    if len(活动列表) == 0:
        活动列表 = [文本]
    
    # 3. 提取每个活动的字段
    结果 = []
    for 活动文本 in 活动列表:
        项 = 提取海报活动字段(活动文本)
        if 项.title:  # 至少要有标题
            结果.append({
                "title": 项.title,
                "date": 项.date,
                "venue": 项.venue,
                "price": 项.price,
                "description": 项.description
            })
    
    return 结果


def 拆分多个活动(文本: str) -> List[str]:
    """拆分多个活动"""
    # 模式1: 数字序号 (1. 2. 3. 或 1️⃣ 2️⃣ 3️⃣)
    数字模式 = r'(?:^|\n)\s*(?:\d+[\.\、]|\d️⃣)\s*'
    
    # 模式2: 项目符号 (- * •)
    符号模式 = r'(?:^|\n)\s*[-\*•]\s*'
    
    # 尝试拆分
    拆分结果 = re.split(数字模式, 文本)
    if len(拆分结果) > 1:
        return [s.strip() for s in 拆分结果 if s.strip()]
    
    拆分结果 = re.split(符号模式, 文本)
    if len(拆分结果) > 1:
        return [s.strip() for s in 拆分结果 if s.strip()]
    
    return []


def 提取海报活动字段(文本: str) -> 海报活动项:
    """
    提取单个海报活动的字段
    按照 Magnes 模板格式：标题、时间、场地、票价、活动描述
    """
    项 = 海报活动项()
    
    # 提取标题
    项.title = 提取标题(文本)
    
    # 提取时间
    项.date = 提取时间(文本)
    
    # 提取场地
    项.venue = 提取场地(文本)
    
    # 提取票价
    项.price = 提取票价(文本)
    
    # 提取活动描述
    项.description = 提取活动描述(文本, 项)
    
    return 项


def 提取标题(文本: str) -> str:
    """提取标题 - 第一行或最显著的文字"""
    # 取第一行
    第一行 = 文本.split('\n')[0].strip()
    
    # 清理 emoji 和特殊符号，保留核心标题
    标题 = re.sub(r'[👩🏻👨🏻👧🏻👦🏻🔛♻️🌸🎫🆓🎨✨📍💰🔥📚🍓❗️]', '', 第一行)
    标题 = re.sub(r'\[话题\]', '', 标题)
    
    # 限制长度
    if len(标题) > 20:
        标题 = 标题[:18] + "..."
    
    return 标题.strip()


def 提取时间(文本: str) -> str:
    """提取时间 - 各种日期格式"""
    时间模式 = [
        # 2025.3.15-3.17 或 2025年3月15日-17日
        r'20\d{2}[\.\-/年]\d{1,2}[\.\-/月]\d{1,2}日?[\s~至-]*\d{1,2}[\.\-/月]?\d{0,2}日?',
        # 3.15-3.17 或 3月15日-3月17日
        r'\d{1,2}[\.\-/月]\d{1,2}日?[\s~至-]*\d{1,2}[\.\-/月]?\d{1,2}日?',
        # 3月15日
        r'\d{1,2}\s*月\s*\d{1,2}\s*日?',
        # 3.15
        r'\d{1,2}\.\d{1,2}',
    ]
    
    for 模式 in 时间模式:
        匹配 = re.search(模式, 文本)
        if 匹配:
            时间 = 匹配.group(0)
            # 标准化格式
            时间 = 时间.replace('年', '.').replace('月', '.').replace('日', '')
            return 时间
    
    return ""


def 提取场地(文本: str) -> str:
    """提取场地 - 地点信息"""
    场地模式 = [
        # 📍符号后
        r'📍\s*([^\n，。]{2,25})',
        # 地址/地点/位于/在 后
        r'(?:地址|地点|位于|在)[：:]\s*([^\n，。]{2,25})',
        # 常见地点词
        r'(淮海中路|南京路|静安区|黄浦区|徐汇区|浦东新区|长宁区|杨浦区|虹口区|外滩|陆家嘴|新天地|田子坊|七宝老街|朱家角|延平路|枫泾路|四川北路|愚园路|衡山路|复兴中路)([^\n，。]{0,15})',
        # XX路/街/广场/中心
        r'([^\n，。]{2,20}(?:路\d+号|路|街|大道|广场|中心|馆|城))',
    ]
    
    for 模式 in 场地模式:
        匹配 = re.search(模式, 文本)
        if 匹配:
            场地 = 匹配.group(1) if 匹配.groups() else 匹配.group(0)
            场地 = 场地.replace('📍', '').strip()
            # 清理过长内容
            if len(场地) > 25:
                场地 = 场地[:22] + "..."
            return 场地
    
    return ""


def 提取票价(文本: str) -> str:
    """提取票价"""
    票价模式 = [
        # 免费相关
        r'(免费|free|Free|0元|免票|无需门票|免门票)',
        # XX元
        r'(\d+)\s*元',
        # ¥XX
        r'¥\s*(\d+)',
        # 票价：XX
        r'票价[：:]\s*([^\n，。]{1,10})',
    ]
    
    for 模式 in 票价模式:
        匹配 = re.search(模式, 文本, re.IGNORECASE)
        if 匹配:
            票价 = 匹配.group(0)
            # 标准化
            if '免费' in 票价 or 'free' in 票价.lower() or '0元' in 票价 or '免票' in 票价:
                return "免费"
            return 票价
    
    return ""


def 提取活动描述(文本: str, 项: 海报活动项) -> str:
    """提取活动描述 - 清理后的核心内容"""
    # 按行处理
    行列表 = 文本.split('\n')
    
    # 过滤掉包含标题、时间、场地、票价的行
    过滤后行 = []
    for 行 in 行列表:
        行 = 行.strip()
        if not 行:
            continue
        
        # 跳过标题行（第一行）
        if len(过滤后行) == 0 and (行 == 项.title or 项.title in 行):
            continue
        
        # 跳过包含时间、场地、票价的行（如果它们很短）
        if len(行) < 15:
            if 项.date and 项.date in 行:
                continue
            if 项.venue and 项.venue in 行:
                continue
            if 项.price and 项.price in 行:
                continue
        
        过滤后行.append(行)
    
    # 合并描述
    描述 = ' '.join(过滤后行)
    
    # 清理话题标签
    描述 = re.sub(r'#\w+\[话题\]', '', 描述)
    描述 = re.sub(r'#\w+', '', 描述)
    
    # 清理 emoji
    描述 = re.sub(r'[👩🏻👨🏻👧🏻👦🏻🔛♻️🌸🎫🆓🎨✨📍💰🔥📚🍓❗️💪🏻🤤]', '', 描述)
    
    # 清理多余空格
    描述 = re.sub(r'\s+', ' ', 描述).strip()
    
    # 限制长度（海报描述不宜过长）
    if len(描述) > 60:
        描述 = 描述[:57] + "..."
    
    return 描述


# 兼容 Magnes 的函数名
extract_semantic_content = 提取语义内容


if __name__ == "__main__":
    import json
    
    # 测试
    测试文本 = """淮海中路女子市集来啦！👩🏻全女市集爱了！！
上海妇女节活动开始啦！！
今天新开的女子女子市场！充满女性力量！💪🏻
还可🆓领冰箱贴、胸针、贴纸！姐妹们冲！
#妇女节活动[话题]# #上海周末去哪儿[话题]# #淮海中路[话题]#"""
    
    结果 = 提取语义内容(测试文本)
    print("测试结果：")
    print(json.dumps(结果, ensure_ascii=False, indent=2))
