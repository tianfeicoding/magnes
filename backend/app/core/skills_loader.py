import os
import re
from typing import Dict, Any, Optional

class SkillsLoader:
    def __init__(self, skills_dir: str):
        self.skills_dir = skills_dir

    def get_skill_instruction(self, skill_id: str) -> Optional[str]:
        """
        加载并解析指定的 SKILL.md，转化为 Prompt 指令串。
        """
        skill_path = os.path.join(self.skills_dir, skill_id, "SKILL.md")
        if not os.path.exists(skill_path):
            print(f"[SkillsLoader] ⚠️ 技能未找到: {skill_id}")
            return None

        try:
            with open(skill_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # 简单的解析逻辑：提取正文，移除 Frontmatter
            # 也可以在这里实现更复杂的逻辑，比如专门提取“约束项”
            instruction = self._clean_markdown(content)
            return instruction
        except Exception as e:
            print(f"[SkillsLoader] 🛑 读取技能失败: {str(e)}")
            return None

    def _clean_markdown(self, content: str) -> str:
        # 移除 YAML Frontmatter
        content = re.sub(r'^---.*?---', '', content, flags=re.DOTALL)
        # 移除一些不必要的 Markdown 标记，或者保持原样让 LLM 读
        return content.strip()

# 全局单例
SKILLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.agent/skills"))
loader = SkillsLoader(SKILLS_DIR)
