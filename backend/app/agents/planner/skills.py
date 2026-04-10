"""
Planner 技能探测与处理
负责从用户输入中识别特定业务技能（如电商生图），并根据技能名称构建动态增强的辅助提示词。
"""
import re
from typing import Optional

def detect_skill(message: str, current_skill: Optional[str] = None, has_image_context: bool = False) -> Optional[str]:
    """
    侦测当前对话产生的技能切换。
    """
    if current_skill:
        return current_skill
        
    last_msg = message.strip()
    
    # 增强侦测逻辑：支持 UI 按钮发出的带有 [技能指令] 前缀的消息
    if "电商生图" in last_msg or "启动电商生图" in last_msg or (last_msg == "1" and has_image_context):
        print(f"[Planner Skills] 🕵️ 探测到技能激活意图: ecommerce-image-gen")
        return "ecommerce-image-gen"
    
    return None

def build_skill_prompt(skill_name: str, skill_summary: Optional[str] = None, active_image_url: Optional[str] = None) -> str:
    """
    根据激活的技能构建增强 Prompt。
    """
    if skill_name == "ecommerce-image-gen":
        from app.skills.ecommerce_manager import build_ecommerce_prompt
        
        # 探测分类
        category_id = None
        if skill_summary:
             cat_match = re.search(r"Category:\s*(\w+)", skill_summary)
             if cat_match: category_id = cat_match.group(1)
        
        skill_prompt = build_ecommerce_prompt(category_id)
        
        _val_to_fill = active_image_url if (not active_image_url or len(active_image_url) < 2000) else "REUSE_CONTEXT_IMAGE"
        
        # 使用安全拼接
        _ecommerce_instr = "\n\n[!!! 极其重要：电商生图技能 (ecommerce-image-gen) 已激活 !!!]\n\n"
        _ecommerce_instr += skill_prompt + "\n\n"
        _ecommerce_instr += f"""请严格遵守以下【同一回合执行】指令，必须仅输出 JSON 对象，严禁任何额外文字：

1. **商品识别并生图 (Step 1)**: 在 JSON 的 "reply" 字段中，首先输出识别结果（名称、分类、核心特征），然后注明“正在为您生成电商主图...”。
2. **风格选择 (Step 2)**: **必须** 从上方的 [# 风格参考图库] 中选出 1 张最符合的参考图 URL 并填入 `parameters.image_urls[1]`。
3. **生成指令 (Step 3/4)**: **必须** 立即调用 "run_painter" 动作：
   - "parameters.prompt": 必须构造一段【高度结构化且基于角色】的英文 Prompt。
     **核心要求：直接利用所选 Image 2 的构图、背景风格、光影和氛围，无需对 Image 2 本身的内容进行文字描述。**
     **必须严格遵循以下基于角色的模板**：
     - Image 1: The main product image showing [Your Product Identification from Step 1].
     - Image 2: The reference image for style, composition, and lighting.
     - Task: Directly apply the composition, background style, and lighting of Image 2 to the product from Image 1.
     - Requirements:
       - Keep the product from Image 1 exactly as is (shape, color, brand details).
       - Inherit the overall background, lighting, and mood from Image 2.
       - Match the perspective and camera angle of Image 2.
     - Output: Professional commercial product photography, 4K quality.
   - "parameters.image_urls": 索引 0 为商品 {_val_to_fill}；索引 1 为你选中的风格图 URL。
   - "parameters.active_skill": 填入 "ecommerce-image-gen"。

**响应模板格式示例**:
{{
  "thought": "正在识别商品并直接触发电商生图流程...",
  "action": "run_painter",
  "reply": "商品识别结果：\\n- 名称：[具体商品名称]\\n- 分类：[分类]\\n- 特征：[具体特征描述]\\n\\n正在为您生成电商主图...",
  "parameters": {{
    "prompt": "- Image 1: The main product image showing [Product Name].\\n- Image 2: Style reference.\\n- Task: Apply composition and lighting from Image 2 to Image 1.\\n- Requirements: Keep product details identical; Inherit lighting and mood from Image 2.\\n- Output: Commercial product photography, 4K quality.",
    "image_urls": ["{_val_to_fill}", "http://.../chosen_style.jpg"],
    "active_skill": "ecommerce-image-gen"
  }}
}}
"""
        return _ecommerce_instr
        
    elif skill_name and skill_summary:
        return f"\n\n[当前技能环境]: {skill_name}\n[技能描述]: {skill_summary}"
        
    return ""
