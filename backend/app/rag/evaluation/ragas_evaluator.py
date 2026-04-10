from typing import List, Dict, Any
import asyncio
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from openai import OpenAI
from ragas.llms import llm_factory
from ragas.embeddings import embedding_factory
from datasets import Dataset
from app.core import llm_config

class RagasEvaluator:
    def __init__(self):
        self.judgement_llm = None
        self.embeddings = None
        self.metrics = []

    async def initialize(self):
        """异步初始化组件"""
        if self.judgement_llm:
            return
            
        # 获取 LLM 配置并初始化 GPT-4o 裁判模型
        base_url, api_key = await llm_config.get_llm_config()
        
        # 1. 创建原生 OpenAI 客户端 (适配 Ragas 0.4.x)
        client = OpenAI(api_key=api_key, base_url=base_url)
        
        # 2. 初始化 Ragas 专用的 LLM
        # Ragas 0.4.x / 0.2.x 的 factory
        self.judgement_llm = llm_factory(provider="openai", model="gpt-4o", client=client)
        
        # 使用 LangChain 标准的 OpenAIEmbeddings 解决 Ragas 内部调用 embed_query 不存在的问题
        from langchain_openai import OpenAIEmbeddings
        from ragas.embeddings import LangchainEmbeddingsWrapper
        
        # 兼容环境变量隔离，强制覆盖 base_url 和 key
        import os
        os.environ["OPENAI_API_KEY"] = api_key
        os.environ["OPENAI_API_BASE"] = base_url
        
        base_embedder = OpenAIEmbeddings(
            model="text-embedding-3-small", 
            api_key=api_key,
            base_url=base_url
        )
        self.embeddings = LangchainEmbeddingsWrapper(base_embedder)
        
        # 手动注入 embeddings 给 answer_relevancy (防止单例未被自动覆盖)
        answer_relevancy.embeddings = self.embeddings
        
        # 3. 初始化指标实例
        self.metrics = [
            faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        ]

    async def evaluate_rag(self, question: str, contexts: List[str], answer: str, ground_truth: str = None) -> Dict[str, float]:
        """
        对单次 RAG 交互进行评估
        """
        data = {
            "question": [question],
            "contexts": [contexts],
            "answer": [answer],
        }
        
        if ground_truth:
            data["reference"] = [ground_truth]
        else:
            data["reference"] = [answer] # 使用大模型回答作为伪参照，使 Recall/Precision 能够正常运转
        
        dataset = Dataset.from_dict(data)
        
        def _run_eval():
            return evaluate(
                dataset=dataset,
                metrics=self.metrics,
                llm=self.judgement_llm,
                raise_exceptions=False
            )
            
        # 运行 RAGAS 评估 (隔离在线程池中运行，避免 uvloop 嵌套事件循环报错)
        result = await asyncio.to_thread(_run_eval)
        
        return result.to_pandas().to_dict(orient="records")[0]

    async def batch_evaluate(self, samples: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        批量评估多个样本
        samples: [{'question': ..., 'contexts': ..., 'answer': ..., 'ground_truth': ...}, ...]
        """
        if not samples:
            return {"status": "error", "message": "没有可评估的数据"}
            
        # 转换格式为 Ragas 期望的格式
        data = {
            "question": [s['question'] for s in samples],
            "contexts": [s['contexts'] for s in samples],
            "answer": [s['answer'] for s in samples],
        }
        
        if any(s.get('ground_truth') or s.get('reference') for s in samples):
            data["reference"] = [
                s.get('reference') or s.get('ground_truth') or s['answer']
                for s in samples
            ]
        else:
            # 如无参照，强制将模型 answer 作为参照
            data["reference"] = [s['answer'] for s in samples]
            
        dataset = Dataset.from_dict(data)
        
        def _run_eval():
            return evaluate(
                dataset=dataset,
                metrics=self.metrics,
                llm=self.judgement_llm,
                raise_exceptions=False
            )
            
        # 运行评估 (隔离在线程池中运行，避免 uvloop 嵌套事件循环报错)
        result = await asyncio.to_thread(_run_eval)
        
        # 计算平均分
        scores_df = result.to_pandas()
        summary = scores_df.mean(numeric_only=True).to_dict()
        
        import math
        # 处理可能的 NaN 结果
        summary = {k: (0.0 if math.isnan(v) else v) for k, v in summary.items()}
        details = scores_df.fillna(0.0).to_dict(orient="records")
        
        return {
            "status": "success",
            "summary": summary,
            "details": details
        }

# 单例模式
_evaluator = None

async def get_ragas_evaluator():
    global _evaluator
    if _evaluator is None:
        _evaluator = RagasEvaluator()
        await _evaluator.initialize()
    return _evaluator
