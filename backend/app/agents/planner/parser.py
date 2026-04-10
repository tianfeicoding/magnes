"""
Planner 响应解析器
提供鲁棒的 JSON 提取与清洗功能，处理 LLM 输出中的格式杂质。
"""
import json
from typing import Optional

def _parse_planner_response(text: str) -> Optional[dict]:
    """
    鲁棒地从 LLM 输出中提取 JSON。
    针对 double braces {{ }} 或 杂质文本进行深度解析。
    """
    if not text: return None
    text = text.strip()
    
    # 预处理：将 LLM 常见的 {{ }} 双大括号转换为合法 JSON 的 { }
    # LLM 在 Python f-string 模版中常生成 {{ }} 转义，需要提前还原
    normalized = text.replace('{{', '{').replace('}}', '}')
    
    # 1. 尝试直接解析（优先用还原后的文本，并关闭 strict 以容忍多行文本中的裸换行符）
    for attempt in [normalized, text]:
        try:
            res = json.loads(attempt, strict=False)
            print(f"[Planner Parser] JSON parsed directly: action={res.get('action')}", flush=True)
            return res
        except Exception:
            pass
    print(f"[Planner Parser] Direct parse failed, trying fallback...", flush=True)
        
    # 2. 尝试从 Markdown 代码块中提取
    import re
    m = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if m:
        try: return json.loads(m.group(1).strip(), strict=False)
        except: pass

    # 3. 递归剥离大括号 (处理 {{ ... }} 或 内容前后的废话)
    # 我们寻找最外层的 { 和 }
    start = text.find('{')
    end = text.rfind('}')
    
    while start != -1 and end > start:
        candidate = text[start:end+1]
        try:
            return json.loads(candidate, strict=False)
        except:
            # 如果解析失败，可能是因为最外层是 {{ }} 导致的不合法，尝试剥离一层再试
            if candidate.startswith('{{') and candidate.endswith('}}'):
                text = candidate[1:-1].strip()
                start = text.find('{')
                end = text.rfind('}')
                continue
            # 否则移除当前的 start 标记位，继续向后寻找下一个 {
            start = text.find('{', start + 1)
            # end 不动，因为 } 通常在末尾比较稳固
        
    return None
