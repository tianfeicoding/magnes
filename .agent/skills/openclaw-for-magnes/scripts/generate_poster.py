#!/usr/bin/env python3
"""
生成海报
用于 openclaw-for-magnes 技能
"""

import json
import sys
import httpx
from pathlib import Path


MAGNES_API_URL = "http://localhost:8088"
MAGNES_API_TOKEN = "magnes_secure_token_2024"  # 从 .env 文件获取


def 获取模版列表() -> list:
    """获取 Magnes 模版列表
    
    返回:
        模版列表
    """
    try:
        响应 = httpx.get(
            f"{MAGNES_API_URL}/api/v1/templates",
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=10.0
        )
        响应.raise_for_status()
        结果 = 响应.json()
        return 结果.get("templates", [])
    except:
        # 默认模版
        return [
            {"id": "fresh_art", "name": "清新文艺风", "description": "适合展览、书店、咖啡探店"},
            {"id": "trendy", "name": "潮流时尚风", "description": "适合潮牌、买手店、快闪店"},
            {"id": "cute", "name": "可爱萌系风", "description": "适合萌宠、甜品、手作市集"},
            {"id": "minimal", "name": "高端简约风", "description": "适合艺术展、奢侈品、高端餐饮"},
            {"id": "sporty", "name": "活力运动风", "description": "适合户外、运动、音乐节"},
            {"id": "vintage", "name": "复古胶片风", "description": "适合 vintage、复古市集、老建筑"},
        ]


def 格式化模版列表(模版列表: list) -> str:
    """格式化模版列表
    
    参数:
        模版列表: 模版列表
        
    返回:
        格式化的文本
    """
    行 = ["🎨 请选择海报模版：\n"]
    
    for 序号, 模版 in enumerate(模版列表, 1):
        名称 = 模版.get("name", f"模版{序号}")
        描述 = 模版.get("description", "")
        行.append(f"[{序号}] **{名称}** - {描述}")
    
    行.append("")
    行.append("请回复数字 1-6 选择模版")
    
    return "\n".join(行)


def 生成海报(市集数据: dict, 模版id: str, 输出路径: str) -> bool:
    """调用 Magnes 生成海报
    
    参数:
        市集数据: 市集数据字典
        模版id: 模版ID
        输出路径: 输出图片路径
        
    返回:
        是否成功
    """
    
    市集 = 市集数据.get("events", [{}])[0] if 市集数据.get("events") else {}
    
    请求体 = {
        "title": 市集.get("name", "市集活动"),
        "subtitle": 市集.get("highlight", "")[:30],
        "date": 市集.get("date", ""),
        "location": 市集.get("location", ""),
        "template": 模版id,
        "return_type": "file"
    }
    
    try:
        响应 = httpx.post(
            f"{MAGNES_API_URL}/api/v1/export/image",
            json=请求体,
            headers={"Authorization": f"Bearer {MAGNES_API_TOKEN}"},
            timeout=60.0
        )
        响应.raise_for_status()
        
        # 保存图片
        with open(输出路径, 'wb') as f:
            f.write(响应.content)
        
        return True
    except Exception as e:
        print(f"生成失败: {e}")
        return False


def 主函数():
    if len(sys.argv) < 2:
        print("用法: python generate_poster.py <总结文件> [模版序号]")
        print("       python generate_poster.py --list-templates")
        sys.exit(1)
    
    # 列出模版
    if sys.argv[1] == "--list-templates":
        模版列表 = 获取模版列表()
        print(格式化模版列表(模版列表))
        
        # 输出模版ID列表
        模版id列表 = [模版.get("id", "") for 模版 in 模版列表]
        print(f"\nTEMPLATE_IDS:{json.dumps(模版id列表)}")
        return
    
    总结文件 = sys.argv[1]
    
    # 读取市集数据
    with open(总结文件, 'r', encoding='utf-8') as f:
        数据 = json.load(f)
    
    # 如果没有指定模版，列出模版
    if len(sys.argv) < 3:
        模版列表 = 获取模版列表()
        print(格式化模版列表(模版列表))
        print(f"\nEVENT_FILE:{总结文件}")
        return
    
    # 生成海报
    模版序号 = int(sys.argv[2]) - 1
    模版列表 = 获取模版列表()
    
    if 模版序号 < 0 or 模版序号 >= len(模版列表):
        print(f"❌ 无效的模版序号: {模版序号 + 1}")
        sys.exit(1)
    
    模版id = 模版列表[模版序号].get("id", "default")
    模版名称 = 模版列表[模版序号].get("name", "默认模版")
    
    print(f"🖼️ 正在使用「{模版名称}」生成海报...")
    
    输出路径 = f"data/poster_{模版id}.png"
    
    if 生成海报(数据, 模版id, 输出路径):
        print(f"✅ 海报生成完成!")
        print(f"  模版: {模版名称}")
        print(f"  市集: {数据.get('events', [{}])[0].get('name', '')}")
        print(f"\nOUTPUT_FILE:{输出路径}")
    else:
        print("❌ 海报生成失败")
        sys.exit(1)


if __name__ == "__main__":
    主函数()
