#!/usr/bin/env python3
"""
整合流程：
1. 使用 xiaohongshu-skills 搜索小红书
2. 调用 Magnes 后端语义提取 API 识别活动信息
3. 返回 Magnes 海报格式的活动数据

用于 openclaw-for-magnes 技能
"""

import json
import sys
import subprocess
import httpx
import re
from datetime import datetime
from pathlib import Path


MAGNES_API_URL = "http://localhost:8088"
MAGNES_API_TOKEN = "magnes_secure_token_2024"
XHS_SKILLS_PATH = "/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/xiaohongshu-skills"


def 搜索小红书(关键词: str, 数量: int = 10) -> list:
    """使用 xiaohongshu-skills 搜索小红书"""
    print(f"🔍 使用 xiaohongshu-skills 搜索: {关键词}")
    
    cmd = [
        "python3", "scripts/cli.py", "search-feeds",
        "--keyword", 关键词,
        "--sort-by", "最多点赞"
    ]
    
    result = subprocess.run(
        cmd,
        cwd=XHS_SKILLS_PATH,
        capture_output=True,
        text=True,
        timeout=120
    )
    
    # 解析输出
    try:
        # 从输出中提取 JSON
        output = result.stdout
        start = output.find('{')
        end = output.rfind('}')
        if start != -1 and end != -1:
            data = json.loads(output[start:end+1])
            feeds = data.get("feeds", [])
            return feeds[:数量]
    except:
        pass
    
    return []


def 获取笔记详情(笔记id: str, xsec_token: str) -> dict:
    """使用 xiaohongshu-skills 获取笔记详情"""
    cmd = [
        "python3", "scripts/cli.py", "get-feed-detail",
        "--feed-id", 笔记id,
        "--xsec-token", xsec_token,
        "--load-all-comments"
    ]
    
    result = subprocess.run(
        cmd,
        cwd=XHS_SKILLS_PATH,
        capture_output=True,
        text=True,
        timeout=90
    )
    
    try:
        output = result.stdout
        start = output.find('{')
        end = output.rfind('}')
        if start != -1 and end != -1:
            return json.loads(output[start:end+1])
    except:
        pass
    
    return {}


def 调用magnes语义提取(文本: str) -> list:
    """调用 Magnes 后端语义提取 API"""
    try:
        print("  🧠 调用 Magnes 语义提取...")
        resp = httpx.post(
            f"{MAGNES_API_URL}/api/v1/mcp/semantic/extract",
            json={"text": 文本},
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=60.0  # 增加超时时间
        )
        resp.raise_for_status()
        result = resp.json()
        return result.get("items", [])
    except Exception as e:
        print(f"  ⚠️ Magnes API 失败: {e}")
        return []


def 本地语义提取(文本: str) -> list:
    """本地语义提取（Magnes API 失败时的回退）"""
    # 简单的正则提取
    结果 = []
    
    # 提取标题（第一行）
    标题 = 文本.split('\n')[0].strip()[:30]
    
    # 提取时间
    时间模式 = r'\d{1,2}[\.\-/月]\d{1,2}(?:[\s~至-]*\d{1,2}[\.\-/月]?\d{0,2})?'
    时间匹配 = re.search(时间模式, 文本)
    时间 = 时间匹配.group(0) if 时间匹配 else ""
    
    # 提取场地
    场地模式 = r'(?:📍|地址|地点|位于)\s*([^\n，。]{2,25})'
    场地匹配 = re.search(场地模式, 文本)
    场地 = 场地匹配.group(1) if 场地匹配 else ""
    
    # 提取票价
    票价模式 = r'(免费|free|Free|0元|免票|¥\d+)'
    票价匹配 = re.search(票价模式, 文本, re.IGNORECASE)
    票价 = 票价匹配.group(0) if 票价匹配 else ""
    
    # 提取描述
    描述 = 文本.split('\n')[1] if len(文本.split('\n')) > 1 else 文本
    描述 = re.sub(r'[#【】\[\]]', '', 描述)[:60]
    
    结果.append({
        "title": 标题,
        "date": 时间,
        "venue": 场地,
        "price": 票价,
        "description": 描述
    })
    
    return 结果


def 处理活动(笔记列表: list, 提取数量: int = 3) -> list:
    """处理笔记列表，提取活动信息"""
    活动列表 = []
    
    for 序号, 笔记 in enumerate(笔记列表[:提取数量], 1):
        笔记id = 笔记.get("id")
        xsec_token = 笔记.get("xsecToken")
        
        print(f"\n[{序号}/{min(len(笔记列表), 提取数量)}] 处理笔记: {笔记.get('displayTitle', '无标题')[:30]}...")
        
        # 获取详情
        if 笔记id and xsec_token:
            详情 = 获取笔记详情(笔记id, xsec_token)
        else:
            详情 = {}
        
        note_detail = 详情.get("note", {})
        标题 = note_detail.get("title", 笔记.get("displayTitle", ""))
        描述 = note_detail.get("desc", "")
        
        # 组合文本
        文本 = f"{标题}\n{描述}"
        
        # 调用 Magnes 语义提取
        提取项 = 调用magnes语义提取(文本)
        
        # 如果 Magnes 失败，使用本地提取
        if not 提取项:
            print("  🔄 使用本地语义提取")
            提取项 = 本地语义提取(文本)
        
        if 提取项:
            主项 = 提取项[0]
            活动信息 = {
                "index": 序号,
                "title": 主项.get("title", 标题),
                "date": 主项.get("date", ""),
                "venue": 主项.get("venue", ""),
                "price": 主项.get("price", ""),
                "description": 主项.get("description", 描述[:80]),
                "source_note_id": 笔记id,
                "liked_count": 笔记.get("interactInfo", {}).get("likedCount", "0"),
                "collected_count": 笔记.get("interactInfo", {}).get("collectedCount", "0"),
                "semantic_items": 提取项,
                "extraction_source": "magnes" if len(提取项) > 0 and 主项.get("date") != 本地语义提取(文本)[0].get("date") else "local"
            }
            
            print(f"  ✅ 标题: {活动信息['title'][:25]}")
            print(f"  📅 时间: {活动信息['date'] or '-'}")
            print(f"  📍 场地: {活动信息['venue'] or '-'}")
            print(f"  💰 票价: {活动信息['price'] or '-'}")
            
            if len(提取项) > 1:
                print(f"  📦 子活动: {len(提取项)} 个")
        else:
            # 基础信息
            活动信息 = {
                "index": 序号,
                "title": 标题,
                "date": "",
                "venue": "",
                "price": "",
                "description": 描述[:80] if 描述 else "",
                "source_note_id": 笔记id,
                "liked_count": 笔记.get("interactInfo", {}).get("likedCount", "0"),
                "collected_count": 笔记.get("interactInfo", {}).get("collectedCount", "0"),
                "semantic_items": [],
                "extraction_source": "none"
            }
        
        # 提取图片
        image_list = note_detail.get("imageList", [])
        活动信息["images"] = [img.get("urlDefault", "") for img in image_list[:3]]
        
        活动列表.append(活动信息)
        
        # 间隔避免请求过快
        if 序号 < min(len(笔记列表), 提取数量):
            import time
            time.sleep(2)
    
    return 活动列表


def 格式化为展示文本(活动数据: dict) -> str:
    """格式化为用户展示文本"""
    活动列表 = 活动数据.get("events", [])
    
    行 = [f"📋 活动信息（Magnes 海报格式）：\n"]
    
    for 活动 in 活动列表:
        行.append(f"**{活动['index']}. {活动['title']}**")
        行.append(f"🗓️ 时间: {活动.get('date') or '-'}")
        行.append(f"📍 场地: {活动.get('venue') or '-'}")
        行.append(f"💰 票价: {活动.get('price') or '-'}")
        行.append(f"📝 描述: {活动.get('description') or '-'}")
        行.append(f"👍 {活动.get('liked_count', '0')} | ⭐ {活动.get('collected_count', '0')}")
        
        if len(活动.get("semantic_items", [])) > 1:
            行.append(f"📦 子活动: {len(活动['semantic_items'])} 个")
        
        行.append("")
    
    行.append("─" * 40)
    行.append("\n🎨 是否需要生成海报？")
    
    return "\n".join(行)


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python xhs_search_magnes_extract.py <关键词> [搜索数量] [提取数量]")
        sys.exit(1)
    
    关键词 = sys.argv[1]
    搜索数量 = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    提取数量 = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    
    print(f"🚀 整合流程：xiaohongshu-skills 搜索 + Magnes 语义提取")
    print(f"   关键词: {关键词}")
    print(f"   搜索: {搜索数量} 条")
    print(f"   提取: {提取数量} 个活动\n")
    
    # 1. 使用 xiaohongshu-skills 搜索
    笔记列表 = 搜索小红书(关键词, 搜索数量)
    
    if not 笔记列表:
        print("❌ 搜索失败或未找到笔记")
        sys.exit(1)
    
    print(f"✅ 找到 {len(笔记列表)} 条笔记\n")
    
    # 2. 处理活动（调用 Magnes 语义提取）
    活动列表 = 处理活动(笔记列表, 提取数量)
    
    # 3. 构建结果
    结果 = {
        "search_time": datetime.now().isoformat(),
        "keyword": 关键词,
        "event_count": len(活动列表),
        "extraction_method": "xhs_search + magnes_extract",
        "events": 活动列表
    }
    
    # 4. 保存
    时间戳 = datetime.now().strftime("%Y%m%d_%H%M%S")
    输出文件 = Path(f"data/xhs_magnes_results_{时间戳}.json")
    
    with open(输出文件, "w", encoding="utf-8") as f:
        json.dump(结果, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已保存到: {输出文件}")
    
    # 5. 展示
    print("\n" + 格式化为展示文本(结果))
    print(f"\nOUTPUT_FILE:{输出文件}")


if __name__ == "__main__":
    主函数()
