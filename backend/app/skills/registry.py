# app/skills/registry.py

SKILL_REGISTRY = [
    {
        "id": "ecommerce-image-gen",
        "label": "电商生图Skill",
        "trigger": "image_upload",
    },
    {
        "id": "prompt-optimizer",
        "label": "提示词优化Skill",
        "trigger": "prompt_optimize_request",  # 由 Planner 主动路由，不依赖用户触发
    }
]

def get_skills_for_trigger(trigger: str) -> list[dict]:
    """根据触发条件返回可用 Skill 列表"""
    return [s for s in SKILL_REGISTRY if s["trigger"] == trigger]
