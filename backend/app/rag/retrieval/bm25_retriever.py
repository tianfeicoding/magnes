"""
bm25_retriever.py - BM25 关键词检索
使用 rank-bm25 库 + jieba 中文分词实现关键词检索
持久化方案：pickle 序列化到 data/bm25_index/
"""
import os
import json
import pickle
import asyncio
from typing import Optional
from datetime import datetime

import jieba
from rank_bm25 import BM25Okapi

from app.rag.vectorstore.chroma_store import get_xhs_collection, get_gallery_collection


class BM25Index:
    """BM25 索引管理器（全局单例）"""
    
    def __init__(self):
        self._bm25: Optional[BM25Okapi] = None
        self._doc_ids: list[str] = []
        self._doc_metas: list[dict] = []
        self._dirty: bool = False
        self._index_path = self._get_index_path()
    
    def _get_index_path(self) -> str:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "data", "bm25_index"))
        os.makedirs(data_dir, exist_ok=True)
        return os.path.join(data_dir, "bm25_index.pkl")
    
    def _tokenize(self, text: str) -> list[str]:
        """jieba 分词，过滤单字和停用词"""
        tokens = jieba.cut(text, cut_all=False)
        stopwords = {'的', '了', '是', '在', '和', '与', '或', '但', '一', '这', '那'}
        return [t for t in tokens if len(t) > 1 and t not in stopwords]
    
    async def rebuild(self):
        """从 ChromaDB 全量重建 BM25 索引"""
        print("[BM25] 开始重建索引...")
        all_docs = []
        all_ids = []
        all_metas = []
        
        for collection in [get_xhs_collection(), get_gallery_collection()]:
            try:
                count = collection.count()
                if count == 0:
                    continue
                data = collection.get(
                    limit=count,
                    include=["metadatas", "documents"]
                )
                for i, doc_id in enumerate(data["ids"]):
                    all_ids.append(doc_id)
                    all_docs.append(data["documents"][i] if data["documents"] else "")
                    all_metas.append(data["metadatas"][i] if data["metadatas"] else {})
            except Exception as e:
                print(f"[BM25] 获取 collection 数据失败: {e}")
        
        if not all_docs:
            print("[BM25] 无文档，跳过索引构建")
            return
        
        # 分词并构建 BM25
        tokenized_corpus = [self._tokenize(doc) for doc in all_docs]
        self._bm25 = BM25Okapi(tokenized_corpus)
        self._doc_ids = all_ids
        self._doc_metas = all_metas
        self._dirty = False
        
        # 持久化
        self.save()
        print(f"[BM25] ✅ 索引重建完成，共 {len(all_ids)} 条文档")
    
    def save(self):
        """序列化保存到磁盘"""
        try:
            with open(self._index_path, 'wb') as f:
                pickle.dump({
                    "bm25": self._bm25,
                    "doc_ids": self._doc_ids,
                    "doc_metas": self._doc_metas
                }, f)
        except Exception as e:
            print(f"[BM25] 保存失败: {e}")
    
    def load(self):
        """从磁盘加载（系统启动时调用）"""
        if not os.path.exists(self._index_path):
            return
        try:
            with open(self._index_path, 'rb') as f:
                data = pickle.load(f)
            self._bm25 = data.get("bm25")
            self._doc_ids = data.get("doc_ids", [])
            self._doc_metas = data.get("doc_metas", [])
            print(f"[BM25] ✅ 索引加载完成，共 {len(self._doc_ids)} 条文档")
        except Exception as e:
            print(f"[BM25] 加载失败（将重建）: {e}")
    
    def mark_dirty(self):
        """标记索引需要重建（新文档入库后调用）"""
        self._dirty = True
    
    async def rebuild_if_dirty(self):
        """在检索前调用，若有新数据则重建"""
        if self._dirty or self._bm25 is None:
            await self.rebuild()
    
    async def search(self, query: str, top_k: int = 20) -> list[dict]:
        """BM25 关键词检索"""
        await self.rebuild_if_dirty()
        
        if self._bm25 is None or not self._doc_ids:
            return []
        
        tokens = self._tokenize(query)
        if not tokens:
            return []
        
        scores = self._bm25.get_scores(tokens)
        
        # 取 top_k
        scored_indices = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:top_k]
        
        results = []
        for idx, score in scored_indices:
            if score <= 0:
                continue
            meta = self._doc_metas[idx]
            try:
                style_tags = json.loads(meta.get("style_tags", "[]"))
            except:
                style_tags = []
            
            results.append({
                "doc_id": self._doc_ids[idx],
                "score": float(score),
                "source_type": meta.get("source_type", ""),
                "image_url": meta.get("image_url", ""),
                "visual_description": "",  # BM25 不存文本内容
                "style_tags": style_tags,
                "rating": meta.get("rating", "unrated"),
                "skill_name": meta.get("skill_name", ""),
                "metadata": meta
            })
        
        return results


# 全局单例
_bm25_index = BM25Index()


def get_bm25_index() -> BM25Index:
    return _bm25_index


async def bm25_search(query: str, top_k: int = 20) -> list[dict]:
    """便捷函数：BM25 关键词检索"""
    return await _bm25_index.search(query, top_k)
