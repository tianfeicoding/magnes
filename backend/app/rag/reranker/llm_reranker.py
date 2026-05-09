"""
llm_reranker.py - LLM 重排器
使用 Gemini Flash 对候选文档进行精准打分和排序
输入：hybrid_retriever 融合后的 top-20
输出：top-3，含排序理由
"""
import os
import json
import httpx
from typing import Optional


RERANKER_PROMPT = """你是一个高精度的文档相关性评估专家。
你的任务是根据用户的“当前查询”，对一系列“候选文档片段”进行深度语义相关性打分。

## 当前查询
{query}

## 候选文档片段（共 {n} 条）
{candidates_text}

## 评分标准 (0-100)
- 90-100: 极其相关，直接回答了问题的核心。
- 70-89: 关键相关，包含重要支持信息。
- 40-69: 部分相关，提供了背景或边缘参考。
- 0-39: 不相关或噪声信息。

## 输出格式（严格 JSON 对象）
{{
  "results": [
    {{"id": "文档ID", "score": 分数, "reason": "10字以内原因"}}
  ]
}}

只输出 JSON，不要任何解释。"""


def format_candidates(candidates: list[dict]) -> str:
    """格式化候选文档为 Reranker 可读文本"""
    lines = []
    for i, c in enumerate(candidates):
        # 兼容不同来源的字段名
        content = c.get('visual_description') or c.get('content') or ""
        lines.append(
            f"ID: {c['doc_id']}\n"
            f"内容: {content[:300]}\n"
        )
    return "\n".join(lines)


async def rerank(
    query: str,
    candidates: list[dict],
    top_k: int = 5,
    skill_name: str = ""
) -> list[dict]:
    """
    使用 LLM 精细化重排 (RAG 5.0 动态阈值机制)
    """
    if not candidates:
        return []
    
    from app.core import llm_config
    import numpy as np

    base_url, api_key = await llm_config.get_llm_config()
    model = "gpt-4o" # 使用更强大的模型进行精细重排
    
    if not api_key:
        return candidates[:top_k]
    
    candidates_text = format_candidates(candidates)
    prompt = RERANKER_PROMPT.format(
        query=query,
        n=len(candidates),
        candidates_text=candidates_text
    )
    
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        
        print(f"DEBUG: [Reranker 5.0] ⚖️ Scoring {len(candidates)} candidates using {model}...")
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={ "type": "json_object" }
        )
        
        content = response.choices[0].message.content.strip()
        
        # 弹性解析 JSON
        try:
            # 由于使用了 response_format={"type": "json_object"}，这里理论上必为 JSON 对象
            raw_data = json.loads(content)
            
            # 支持多种可能的 key 名以增强鲁棒性
            ranked_data = []
            if isinstance(raw_data, list):
                ranked_data = raw_data
            elif isinstance(raw_data, dict):
                 # 优先取约定好的 results 键
                 ranked_data = raw_data.get("results") or raw_data.get("items") or []
                 if not ranked_data:
                     # 兜底：取第一个列表值
                     for v in raw_data.values():
                         if isinstance(v, list):
                             ranked_data = v
                             break
            
            # 关键修复：确保列表中的项都是字典，过滤掉可能的字符串备注
            ranked_data = [item for item in ranked_data if isinstance(item, dict) and 'id' in item]
            
        except Exception as e:
            print(f"DEBUG: [Reranker 5.0] ❌ JSON Parse Error: {e}, content: {content[:100]}")
            return candidates[:top_k]

        # 1. 组装分数映射
        score_map = {str(item['id']): item for item in ranked_data}
        scored_candidates = []
        for c in candidates:
            cid = str(c['doc_id'])
            if cid in score_map:
                try:
                    c['llm_score'] = float(score_map[cid].get('score', 0))
                    c['rerank_reason'] = str(score_map[cid].get('reason', ''))
                    scored_candidates.append(c)
                except (ValueError, TypeError):
                    continue
        
        if not scored_candidates:
            return candidates[:top_k]

        # 2. 计算动态阈值 (Mean + 0.5 * StdDev)
        scores = [c['llm_score'] for c in scored_candidates]
        mean_score = np.mean(scores)
        std_dev = np.std(scores)
        threshold = mean_score + 0.5 * std_dev
        
        print(f"DEBUG: [Reranker 5.0] 📊 Stats - Mean: {mean_score:.2f}, Std: {std_dev:.2f}, Threshold: {threshold:.2f}")

        # 3. 排序与过滤 (Top K + 阈值拦截)
        # 按分数降序
        scored_candidates.sort(key=lambda x: x['llm_score'], reverse=True)
        
        # 过滤掉低于阈值的结果 (但至少保留一个最相关的，除非全为零)
        final_results = [
            c for c in scored_candidates 
            if c['llm_score'] >= threshold or (c == scored_candidates[0] and c['llm_score'] > 0)
        ]
        
        print(f"DEBUG: [Reranker 5.0] ✅ Final: {len(final_results)} nodes passed filter (out of {len(scored_candidates)})")
        
        # 限制返回数量为 top_k
        return final_results[:top_k]
            
    except Exception as e:
        print(f"DEBUG: [Reranker 5.0] ❌ Rerank Exception: {e}")
        return candidates[:top_k]

