#!/usr/bin/env python3
"""
搜索小红书笔记并保存详情到 JSON
用于 openclaw-for-magnes 技能
"""

import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


def 从输出中提取json(output: str) -> dict | None:
    """从混合输出中提取 JSON 数据"""
    # 找到第一个 {
    start = output.find('{')
    if start == -1:
        return None
    
    # 从后往前找到最后一个 }
    end = output.rfind('}')
    if end == -1 or end < start:
        return None
        
    json_str = output[start:end+1]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        return None


def 搜索笔记(关键词: str, 数量: int = 10) -> list:
    """搜索小红书笔记
    
    参数:
        关键词: 搜索关键词
        数量: 返回笔记数量
        
    返回:
        笔记列表
    """
    命令 = [
        "python3", "scripts/cli.py", "search-feeds",
        "--keyword", 关键词,
        "--sort-by", "最多点赞"
    ]
    
    结果 = subprocess.run(
        命令,
        cwd="/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/xiaohongshu-skills",
        capture_output=True,
        text=True,
        timeout=120
    )
    
    数据 = 从输出中提取json(结果.stdout)
    if not 数据:
        return []
    
    笔记列表 = 数据.get("feeds", [])
    return 笔记列表[:数量]


def 获取笔记详情(笔记id: str, xsec令牌: str) -> dict | None:
    """获取笔记详情
    
    参数:
        笔记id: 笔记ID
        xsec令牌: XSEC 令牌
        
    返回:
        笔记详情字典
    """
    命令 = [
        "python3", "scripts/cli.py", "get-feed-detail",
        "--feed-id", 笔记id,
        "--xsec-token", xsec令牌,
        "--load-all-comments"
    ]
    
    结果 = subprocess.run(
        命令,
        cwd="/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/xiaohongshu-skills",
        capture_output=True,
        text=True,
        timeout=90
    )
    
    return 从输出中提取json(结果.stdout)


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python search_and_save.py <关键词> [数量]")
        sys.exit(1)
    
    关键词 = sys.argv[1]
    数量 = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    print(f"🔍 搜索: {关键词} (数量={数量})")
    
    # 搜索笔记
    笔记列表 = 搜索笔记(关键词, 数量)
    if not 笔记列表:
        print("❌ 未找到笔记")
        sys.exit(1)
    
    print(f"✓ 找到 {len(笔记列表)} 条笔记")
    
    # 获取详情
    笔记数据 = []
    for 序号, 笔记 in enumerate(笔记列表, 1):
        笔记id = 笔记.get("id")
        xsec令牌 = 笔记.get("xsecToken")
        
        if not 笔记id or not xsec令牌:
            continue
        
        print(f"\n[{序号}/{len(笔记列表)}] 获取详情: {笔记id}")
        
        详情 = 获取笔记详情(笔记id, xsec令牌)
        
        笔记数据.append({
            "rank": 序号,
            "id": 笔记id,
            "xsecToken": xsec令牌,
            "title": 笔记.get("displayTitle", ""),
            "type": 笔记.get("type", "normal"),
            "author": 笔记.get("user", {}),
            "interactInfo": 笔记.get("interactInfo", {}),
            "cover": 笔记.get("cover", ""),
            "detail": 详情
        })
        
        if 序号 < len(笔记列表):
            print("  等待5秒...")
            time.sleep(5)
    
    # 保存结果
    时间戳 = datetime.now().strftime("%Y%m%d_%H%M%S")
    输出文件 = Path(f"data/search_results_{时间戳}.json")
    
    结果 = {
        "search_time": datetime.now().isoformat(),
        "keyword": 关键词,
        "total_count": len(笔记数据),
        "notes": 笔记数据
    }
    
    with open(输出文件, 'w', encoding='utf-8') as f:
        json.dump(结果, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已保存到: {输出文件}")
    print(f"  成功: {sum(1 for n in 笔记数据 if n['detail'] is not None)}/{len(笔记数据)}")
    
    # 输出文件路径（供 OpenClaw 捕获）
    print(f"\nOUTPUT_FILE:{输出文件}")


if __name__ == "__main__":
    主函数()
