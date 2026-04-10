#!/usr/bin/env python3
"""
直接调用 Magnes 后端进行小红书搜索和活动识别
用于 openclaw-for-magnes 技能

流程：
1. 调用 Magnes /api/v1/rag/xhs/search 搜索小红书
2. 调用 Magnes /api/v1/mcp/semantic/extract 识别活动信息
3. 返回 Magnes 海报格式的活动数据
"""

import json
import sys
import httpx
from datetime import datetime
from pathlib import Path


MAGNES_API_URL = "http://localhost:8088"
MAGNES_API_TOKEN = "magnes_secure_token_2024"


def 搜索小红书(关键词: str, 数量: int = 10) -> dict:
    """
    调用 Magnes 后端搜索小红书
    
    API: POST /api/v1/rag/xhs/search
    """
    try:
        print(f"🔍 调用 Magnes 搜索: {关键词} (limit={数量})")
        
        响应 = httpx.post(
            f"{MAGNES_API_URL}/api/v1/rag/xhs/search",
            json={"prompt": 关键词, "limit": 数量},
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=60.0
        )
        响应.raise_for_status()
        
        结果 = 响应.json()
        print(f"✅ 搜索成功，获取 {len(结果.get('results', []))} 条结果")
        return 结果
        
    except Exception as e:
        print(f"❌ 搜索失败: {e}")
        return {"status": "error", "message": str(e), "results": []}


def 识别活动信息(文本: str) -> list:
    """
    调用 Magnes 后端语义提取识别活动信息
    
    API: POST /api/v1/mcp/semantic/extract
    """
    try:
        响应 = httpx.post(
            f"{MAGNES_API_URL}/api/v1/mcp/semantic/extract",
            json={"text": 文本},
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=30.0
        )
        响应.raise_for_status()
        
        结果 = 响应.json()
        return 结果.get("items", [])
        
    except Exception as e:
        print(f"⚠️ 语义提取失败: {e}")
        return []


def 处理搜索结果(搜索结果: dict, 提取数量: int = 3) -> list:
    """
    处理搜索结果，提取活动信息（Magnes 海报格式）
    """
    笔记列表 = 搜索结果.get("results", [])[:提取数量]
    活动列表 = []
    
    for 序号, 笔记 in enumerate(笔记列表, 1):
        print(f"\n[{序号}/{len(笔记列表)}] 处理笔记: {笔记.get('title', '无标题')[:30]}...")
        
        # 组合文本
        标题 = 笔记.get("title", "")
        描述 = 笔记.get("desc", "")
        文本 = f"{标题}\n{描述}"
        
        # 调用 Magnes 语义提取
        提取项 = 识别活动信息(文本)
        
        if 提取项:
            主项 = 提取项[0]
            活动信息 = {
                "index": 序号,
                "title": 主项.get("title", 标题),
                "date": 主项.get("date", ""),
                "venue": 主项.get("venue", 笔记.get("location", "")),
                "price": 主项.get("price", ""),
                "description": 主项.get("description", 描述[:80]),
                "source_note_id": 笔记.get("note_id", ""),
                "liked_count": str(笔记.get("liked_count", 0)),
                "collected_count": str(笔记.get("collected_count", 0)),
                "semantic_items": 提取项,
                "images": [笔记.get("cover_image", "")]
            }
            
            # 显示子活动
            if len(提取项) > 1:
                print(f"  📦 识别到 {len(提取项)} 个子活动")
        else:
            # 回退：使用原始数据
            活动信息 = {
                "index": 序号,
                "title": 标题,
                "date": "",
                "venue": 笔记.get("location", ""),
                "price": "",
                "description": 描述[:80] if 描述 else "",
                "source_note_id": 笔记.get("note_id", ""),
                "liked_count": str(笔记.get("liked_count", 0)),
                "collected_count": str(笔记.get("collected_count", 0)),
                "semantic_items": [],
                "images": [笔记.get("cover_image", "")]
            }
        
        活动列表.append(活动信息)
    
    return 活动列表


def 格式化为展示文本(活动数据: dict) -> str:
    """格式化为用户展示文本（Magnes 海报格式）"""
    活动列表 = 活动数据.get("events", [])
    
    行 = [f"📋 Magnes 后端识别结果 - 为你精选 {len(活动列表)} 个市集：\n"]
    
    for 活动 in 活动列表:
        行.append(f"**{活动['index']}. {活动['title']}**")
        
        # Magnes 海报模板字段
        if 活动.get("date"):
            行.append(f"🗓️ 时间: {活动['date']}")
        if 活动.get("venue"):
            行.append(f"📍 场地: {活动['venue']}")
        if 活动.get("price"):
            行.append(f"💰 票价: {活动['price']}")
        if 活动.get("description"):
            行.append(f"📝 描述: {活动['description']}")
        
        行.append(f"👍 {活动.get('liked_count', '0')} | ⭐ {活动.get('collected_count', '0')}")
        
        子活动数 = len(活动.get("semantic_items", []))
        if 子活动数 > 1:
            行.append(f"📦 包含 {子活动数} 个子活动")
        
        行.append("")
    
    行.append("─" * 40)
    行.append("\n🎨 是否需要生成海报？")
    
    return "\n".join(行)


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python search_and_extract_magnes.py <关键词> [搜索数量] [提取数量]")
        print("示例: python search_and_extract_magnes.py '上海三月市集' 10 3")
        sys.exit(1)
    
    关键词 = sys.argv[1]
    搜索数量 = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    提取数量 = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    
    print(f"🚀 使用 Magnes 后端进行搜索和识别")
    print(f"   关键词: {关键词}")
    print(f"   搜索数量: {搜索数量}")
    print(f"   提取数量: {提取数量}")
    print()
    
    # 1. 调用 Magnes 搜索小红书
    搜索结果 = 搜索小红书(关键词, 搜索数量)
    
    if 搜索结果.get("status") == "error":
        print(f"❌ 搜索失败: {搜索结果.get('message')}")
        sys.exit(1)
    
    # 2. 调用 Magnes 识别活动信息
    活动列表 = 处理搜索结果(搜索结果, 提取数量)
    
    # 3. 构建结果
    结果 = {
        "search_time": datetime.now().isoformat(),
        "keyword": 关键词,
        "event_count": len(活动列表),
        "extraction_method": "magnes_backend",
        "api_endpoints": [
            "/api/v1/rag/xhs/search",
            "/api/v1/mcp/semantic/extract"
        ],
        "events": 活动列表
    }
    
    # 4. 保存结果
    时间戳 = datetime.now().strftime("%Y%m%d_%H%M%S")
    输出文件 = Path(f"data/magnes_backend_results_{时间戳}.json")
    
    with open(输出文件, "w", encoding="utf-8") as f:
        json.dump(结果, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已保存到: {输出文件}")
    
    # 5. 输出展示文本
    展示文本 = 格式化为展示文本(结果)
    print("\n" + 展示文本)
    
    print(f"\nOUTPUT_FILE:{输出文件}")


if __name__ == "__main__":
    主函数()
