# app/skills/ecommerce_manager.py
from pathlib import Path
import re
import os

# 路径适配：magnes/backend/app/skills/ecommerce_manager.py -> magnes/.agent/skills/ecommerce-image-gen
SKILL_BASE_DIR = Path(__file__).parent.parent.parent.parent / ".agent" / "skills" / "ecommerce-image-gen"

def load_skill_content() -> str:
    """加载 SKILL.md 内容"""
    skill_file = SKILL_BASE_DIR / "SKILL.md"
    if not skill_file.exists():
        return ""
    return skill_file.read_text(encoding="utf-8")

def load_category_config(category_id: str = None) -> str:
    """加载分类配置"""
    cat_file = SKILL_BASE_DIR / "references" / "categories.md"
    if not cat_file.exists():
        return ""
    
    content = cat_file.read_text(encoding="utf-8")
    if not category_id:
        return content
    
    # 简单的按二级标题切分寻找特定分类
    sections = re.split(r"\n(?=## )", content)
    for section in sections:
        if category_id.lower() in section.lower():
            return section
    return content

def load_reference_images(category_id: str = None) -> str:
    """获取分类下的参考图列表及其可访问 URL"""
    base_url = "http://localhost:8088/skills_assets/skills/ecommerce-image-gen/assets/reference-images"
    ref_root = SKILL_BASE_DIR / "assets" / "reference-images"
    
    if not ref_root.exists() or not ref_root.is_dir():
        return ""

    all_refs = []
    
    # 获取子目录列表
    categories = [d for d in ref_root.iterdir() if d.is_dir()]
    
    for cat_dir in categories:
        cat_name = cat_dir.name
        # 如果指定了 category_id，只处理该分类
        if category_id and cat_name.lower() != category_id.lower():
            continue
            
        images = []
        for f in cat_dir.iterdir():
            if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                url = f"{base_url}/{cat_name}/{f.name}"
                images.append(f"- [{cat_name}] {f.name}: {url}")
        
        if images:
            all_refs.extend(images)
    
    if not all_refs:
        return ""
    
    return "\n# 风格参考图库 (Style Reference Library)\n在构造 run_painter 时，请从中选择一张最符合商品分类的参考图作为参数，或参考其视觉风格进行描述：\n" + "\n".join(all_refs)

def build_ecommerce_prompt(category_id: str = None) -> str:
    """组装电商生图专属系统提示词"""
    base = load_skill_content()
    cat = load_category_config(category_id)
    refs = load_reference_images(category_id)
    
    prompt = f"{base}\n\n---\n\n# 电商分类参考规范\n{cat}\n\n{refs}\n\n---\n\n# 核心约束 (STRICT PROMPT TEMPLATE)\n所有生成的 run_painter 指令中的 parameters.prompt 必须严格遵循以下基于角色的结构化模板，禁止任何额外废话：\n\n- Image 1: Main product from the user upload.\n- Image 2: Selected style reference image.\n- Task: Apply the environment, lighting, and composition from Image 2 to the product in Image 1.\n- Requirements:\n    - Protect Information of Image 1: Keep its shape, label, and texture details exactly as they are.\n    - Inherit Style from Image 2: Use the background, lighting, color palette, and camera angle of Image 2.\n- Output: Professional commercial product photography, 4K quality.\n"
    return prompt
