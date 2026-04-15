# app/skills/prompt_optimizer.py
"""
Prompt-Optimizer Skill 管理器
职责：
1. 加载 SKILL.md 中的提示词优化协议
2. 从 Golden Prompt 数据库中检索相关成功案例（向量检索）
3. 注入背景上下文，组装完整的 Prompt-Optimizer 系统提示词
4. 提供视觉反馈入库接口（将优秀图片的视觉分析结果写入 Golden Prompt 库）
"""
from pathlib import Path
from typing import Optional, List, Dict, Any
import json
import os

# Skill 数据目录
SKILL_BASE_DIR = Path(__file__).parent.parent.parent.parent / ".agent" / "skills" / "prompt-optimizer"


def load_skill_content() -> str:
    """加载 SKILL.md 内容"""
    skill_file = SKILL_BASE_DIR / "SKILL.md"
    if not skill_file.exists():
        return ""
    return skill_file.read_text(encoding="utf-8")


def load_golden_prompts(limit: int = 5) -> List[Dict[str, Any]]:
    """
    从本地 JSON 文件加载 Golden Prompt 数据库。
    后续可替换为 ChromaDB 向量检索。
    """
    golden_file = SKILL_BASE_DIR / "data" / "golden_prompts.json"
    if not golden_file.exists():
        return []
    try:
        with open(golden_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            prompts = data.get("prompts", [])
            # 按收藏时间排序，返回最新的 N 条
            sorted_prompts = sorted(prompts, key=lambda x: x.get("saved_at", ""), reverse=True)
            return sorted_prompts[:limit]
    except Exception as e:
        print(f"[PromptOptimizer] 加载 Golden Prompts 失败: {e}")
        return []


def save_golden_prompt(
    prompt: str,
    image_url: str,
    visual_features: Optional[str] = None,
    source: str = "user_saved",
    model_used: str = "nano-banana"
) -> bool:
    """
    将一条成功的提示词存入 Golden Prompt 数据库。
    由用户"收藏提示词"行为触发。
    
    Args:
        prompt: 原始或优化后的提示词
        image_url: 对应的图片 URL（用于关联）
        visual_features: 由 visual_analyzer 提取的视觉特征文字（可选，用于增强）
        source: 来源（user_saved / auto_collect）
        model_used: 生成该图时使用的模型
    """
    from datetime import datetime, timezone
    
    golden_file = SKILL_BASE_DIR / "data" / "golden_prompts.json"
    golden_file.parent.mkdir(parents=True, exist_ok=True)
    
    # 读取现有数据
    existing = {"prompts": []}
    if golden_file.exists():
        try:
            with open(golden_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = {"prompts": []}

    # 构建新条目
    new_entry = {
        "id": f"gp_{int(datetime.now(timezone.utc).timestamp())}",
        "prompt": prompt,
        "image_url": image_url,
        "visual_features": visual_features or "",
        "user_tags": [], #用户自定义标签
        "source": source,
        "model_used": model_used,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "use_count": 0
    }

    existing["prompts"].append(new_entry)
    
    try:
        with open(golden_file, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        print(f"[PromptOptimizer] ✅ Golden Prompt 已保存: {new_entry['id']}")
        return True
    except Exception as e:
        print(f"[PromptOptimizer] ❌ 保存失败: {e}")
        return False


def delete_golden_prompt(prompt_id: str) -> bool:
    """从本地 JSON 文件中物理删除提示词"""
    golden_file = SKILL_BASE_DIR / "data" / "golden_prompts.json"
    if not golden_file.exists():
        return False
        
    try:
        with open(golden_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        prompts = data.get("prompts", [])
        new_prompts = [p for p in prompts if p.get("id") != prompt_id]
        
        if len(prompts) == len(new_prompts):
            return False # 未找到
            
        data["prompts"] = new_prompts
        with open(golden_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[PromptOptimizer] ❌ 删除失败: {e}")
        return False


def update_golden_prompt_tags(prompt_id: str, tags: list) -> bool:
    """更新指定提示词的用户自定义标签"""
    golden_file = SKILL_BASE_DIR / "data" / "golden_prompts.json"
    if not golden_file.exists():
        return False
        
    try:
        with open(golden_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        prompts = data.get("prompts", [])
        found = False
        for p in prompts:
            if p.get("id") == prompt_id:
                p["user_tags"] = tags
                found = True
                break
        
        if not found:
            return False
            
        with open(golden_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[PromptOptimizer] ❌ 更新标签失败: {e}")
        return False


def build_golden_prompt_context(golden_prompts: List[Dict[str, Any]]) -> str:
    """将 Golden Prompt 列表格式化为 LLM 可读的上下文文本"""
    if not golden_prompts:
        return ""
    
    lines = ["\n\n# [Golden Prompt 参考库] (历史成功案例，请参考其中的专业词汇)"]
    for i, gp in enumerate(golden_prompts, 1):
        prompt_preview = gp.get("prompt", "")[:120] + ("..." if len(gp.get("prompt", "")) > 120 else "")
        model = gp.get("model_used", "unknown")
        lines.append(f"\n## 案例 {i} (模型: {model})")
        lines.append(f"```\n{prompt_preview}\n```")
        if gp.get("visual_features"):
            vf_preview = gp["visual_features"][:80] + ("..." if len(gp["visual_features"]) > 80 else "")
            lines.append(f"视觉特征：{vf_preview}")
    
    return "\n".join(lines)


def build_optimizer_prompt(
    current_model: Optional[str] = None,
    max_golden_prompts: int = 3
) -> str:
    """
    组装完整的 Prompt-Optimizer 系统提示词。
    
    Args:
        current_model: 当前使用的生图模型 ID，用于适配输出格式
        max_golden_prompts: 注入的 Golden Prompt 案例数量
        
    Returns:
        完整的系统提示词字符串
    """
    # 1. 加载 Skill 核心协议
    base = load_skill_content()
    if not base:
        # 兜底方案：如果 SKILL.md 不存在，使用内嵌的简化版本
        base = _get_fallback_prompt()
    
    # 2. 加载 Golden Prompt 案例
    golden_prompts = load_golden_prompts(limit=max_golden_prompts)
    golden_context = build_golden_prompt_context(golden_prompts)
    
    # 3. 模型感知注入
    model_hint = ""
    if current_model:
        if "nano-banana" in current_model or "jimeng" in current_model:
            model_hint = "\n\n[当前目标模型]: Nano-Banana 系列 - 请使用叙述式英文 Prompt，避免复杂权重括号语法。"
        elif "flux" in current_model.lower():
            model_hint = "\n\n[当前目标模型]: Flux 系列 - 可使用 (keyword:1.2) 权重增强语法。"
        else:
            model_hint = f"\n\n[当前目标模型]: {current_model} - 请使用通用格式。"
    
    # 4. 组装最终 Prompt
    optimizer_instr = (
        "\n\n[!!! Prompt-Optimizer Skill 已激活 !!!]\n\n"
        "请立即以专业提示词优化专家的角色运作。根据以下 SKILL 协议对用户的原始描述进行增强："
    )
    
    return f"{base}{golden_context}{model_hint}{optimizer_instr}"


def _get_fallback_prompt() -> str:
    """内嵌的后备 Prompt，当 SKILL.md 不可用时使用"""
    return """你是一位专业的 AI 图像提示词优化专家（Prompt Architect）。
    
你的任务是将用户输入的简单描述转化为专业的视觉提示词，需要：
1. 保留原始意图和核心主体
2. 补充光线、构图、风格等专业视觉词汇
3. 添加画质技术词（photorealistic, 8K, sharp focus 等）
4. 输出英文提示词（AI 生图效果更佳）

输出必须为 JSON 格式，包含：optimized_prompt, prompt_cn, key_additions, model_hint, version, confidence"""


async def trigger_visual_learning(
    image_url: str,
    original_prompt: str,
    model_used: str = "nano-banana",
    db=None
) -> Optional[str]:
    """
    视觉反馈学习：对图片进行视觉分析并将结果存入 Golden Prompt 库。
    由"收藏提示词"操作触发，在后台异步执行。
    
    Args:
        image_url: 要分析的图片 URL
        original_prompt: 该图片的原始生成提示词
        model_used: 生成该图使用的模型
        db: 数据库会话（用于 LLM 配置）
        
    Returns:
        提取到的 visual_features 字符串
    """
    try:
        from app.tools.visual_analyzer import analyze_visual_style
        from app.core import prompts as core_prompts

        # 使用专门提取背景提示词的指令
        extract_prompt = getattr(
            core_prompts, "STYLE_EXTRACTION_PROMPT",
            "Analyze this image and extract a concise English visual style prompt that captures: "
            "lighting style, color palette, composition, mood, and photographic style. "
            "Return as JSON with key 'backgroundPrompt'."
        )
        
        result = await analyze_visual_style(
            prompt=extract_prompt,
            image_urls=[image_url],
            db=db
        )
        
        visual_features = None
        if result.get("status") == "success":
            content = result.get("content", "")
            # 尝试提取 backgroundPrompt
            import re
            match = re.search(r'"backgroundPrompt":\s*"([^"]+)"', content)
            if match:
                visual_features = match.group(1)
            else:
                # 如果解析失败，截取前 200 字符的分析文本
                visual_features = content[:200]
        
        # 存入 Golden Prompt 库
        save_golden_prompt(
            prompt=original_prompt,
            image_url=image_url,
            visual_features=visual_features,
            source="auto_visual_learning",
            model_used=model_used
        )
        
        print(f"[PromptOptimizer] ✅ 视觉反馈学习完成: 提取特征 {len(visual_features or '')} 字符")
        return visual_features
        
    except Exception as e:
        print(f"[PromptOptimizer] ❌ 视觉学习任务失败: {e}")
        return None
