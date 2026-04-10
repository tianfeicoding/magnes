"""
Security Check Agent
负责对生成内容进行敏感词和广告法违规词检查。
"""
import os
from typing import List, Tuple

SENSITIVE_WORDS_FILE = os.path.join(os.path.dirname(__file__), "..", "core", "security", "sensitive_words.txt")

def load_sensitive_words() -> List[str]:
    """加载敏感词库"""
    if not os.path.exists(SENSITIVE_WORDS_FILE):
        return []
    with open(SENSITIVE_WORDS_FILE, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]

async def check_sensitive_words(text: str) -> Tuple[bool, List[str]]:
    """
    检查文本中是否包含敏感词
    返回: (是否通过, 发现的敏感词列表)
    """
    words = load_sensitive_words()
    found = []
    
    # 1. 基础硬匹配
    for word in words:
        if word in text:
            found.append(word)
            
    # 2. 这里的后续可以扩展为使用 LLM 进行语义级违规检查（例如广告法风险）
    # 目前先实现基础的硬匹配逻辑
    
    is_safe = len(found) == 0
    return is_safe, found
