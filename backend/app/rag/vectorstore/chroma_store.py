"""
chroma_store.py - ChromaDB 向量存储
维护三个 Collection：xhs_covers + version_gallery + knowledge_base
支持 upsert 去重（doc.id 作为 ChromaDB document ID）
"""
import os
import json
from typing import Optional, Union
from datetime import datetime

import chromadb
from chromadb.config import Settings

from app.rag.models.note_document import NoteDocument
from app.rag.models.gallery_document import GalleryDocument
from app.rag.models.knowledge_document import KnowledgeChunk
from app.rag.vectorstore.embedder import embed_text, build_embed_text
from app.rag.config import CHROMA_DATA_PATH, EMBED_BATCH_SIZE


# ─── 全局 ChromaDB 客户端（单例）────────────────────────────────────────────

_chroma_client = None
_xhs_collection = None
_gallery_collection = None
_knowledge_collection = None
_favorite_images_collection = None


def get_chroma_client():
    """获取或初始化 ChromaDB 客户端（持久化到 backend/data/chromadb）"""
    global _chroma_client
    if _chroma_client is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.abspath(CHROMA_DATA_PATH)
        os.makedirs(data_dir, exist_ok=True)
        
        _chroma_client = chromadb.PersistentClient(
            path=data_dir,
            settings=Settings(anonymized_telemetry=False)
        )
        print(f"[ChromaDB] ✅ 初始化完成，存储路径: {data_dir}")
    
    return _chroma_client


def get_collection(name: str):
    """获取或创建指定 Collection"""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"}  # 使用余弦相似度
    )


def get_xhs_collection():
    global _xhs_collection
    if _xhs_collection is None:
        _xhs_collection = get_collection("xhs_covers_v2")
    return _xhs_collection


def get_gallery_collection():
    global _gallery_collection
    if _gallery_collection is None:
        _gallery_collection = get_collection("version_gallery_v2")
    return _gallery_collection


def get_knowledge_collection():
    global _knowledge_collection
    if _knowledge_collection is None:
        # 统一使用 knowledge_base 集合，适配 1024 维向量
        _knowledge_collection = get_collection("knowledge_base")
    return _knowledge_collection


def get_favorites_collection():
    global _favorite_images_collection
    if _favorite_images_collection is None:
        _favorite_images_collection = get_collection("favorited_images")
    return _favorite_images_collection


# ─── LlamaIndex 集成支持 ───────────────────────────────────────────────────

def get_llama_vector_store(collection_name: str = "knowledge_base_v2"):
    """
    获取 LlamaIndex 封装的 ChromaVectorStore
    """
    from llama_index.vector_stores.chroma import ChromaVectorStore
    
    # 根据名称获取对应的 ChromaDB Collection
    if collection_name.startswith("xhs_covers"):
        collection = get_xhs_collection()
    elif collection_name.startswith("version_gallery"):
        collection = get_gallery_collection()
    else:
        # 默认指向唯一的知识库集合
        collection = get_knowledge_collection()
        
    return ChromaVectorStore(chroma_collection=collection)


def get_llama_storage_context(collection_name: str = "knowledge_base_v2"):
    """
    获取 LlamaIndex StorageContext (包含 VectorStore)
    """
    from llama_index.core import StorageContext
    
    vector_store = get_llama_vector_store(collection_name)
    return StorageContext.from_defaults(vector_store=vector_store)


# ─── 核心操作 ───────────────────────────────────────────────────────────────

async def upsert_document(doc: Union[NoteDocument, GalleryDocument]) -> bool:
    """
    将文档 upsert 到 ChromaDB
    - 已存在（相同 doc.id）：更新 embedding 和 metadata
    - 不存在：新增
    
    Returns:
        True: 新增; False: 更新已有文档
    """
    # 构建向量化文本
    embed_input = build_embed_text(doc)
    embedding = await embed_text(embed_input)
    
    if embedding is None:
        # 向量化失败，使用空向量（降级处理，仍能 BM25 检索）
        print(f"[ChromaStore] ⚠️ 向量化失败，文档 {doc.id} 将仅支持 BM25 检索")
        embedding = [0.0] * 1024  # 修正：适配 qwen3-embedding-8b 的 1024 维
    
    # 构建 metadata（ChromaDB 只支持 str/int/float/bool）
    if isinstance(doc, NoteDocument):
        collection = get_xhs_collection()
        metadata = {
            "doc_id": doc.id,  # [NEW] 显式添加 ID 字段以便于 LlamaIndex 过滤器使用
            "source_type": doc.source_type,
            "title": doc.title or "",
            "content": doc.content or "",
            "xsec_token": doc.xsec_token or "",  # 持久化令牌
            "image_url": doc.image_url or "",
            "ocr_text": (doc.ocr_text or "")[:500],
            "style_tags": json.dumps(doc.style_tags, ensure_ascii=False),
            "likes": doc.likes,
            "collected_count": doc.collected_count,
            "comment_count": doc.comment_count,
            "all_images": json.dumps(doc.all_images or [], ensure_ascii=False),
            "url": doc.url or "",
            "created_at": doc.created_at.isoformat()
        }
    else:  # GalleryDocument
        collection = get_gallery_collection()
        metadata = {
            "source_type": doc.source_type,
            "image_url": doc.image_url or "",
            "visual_description": doc.visual_description[:500] if doc.visual_description else "",
            "rating": doc.rating,
            "skill_name": doc.skill_name or "",
            "style_tags": json.dumps(doc.style_tags, ensure_ascii=False),
            "user_tags": json.dumps(doc.user_tags, ensure_ascii=False),
            "group_id": doc.group_id or "",
            "folder_name": doc.folder_name or "",
            "prompt": doc.prompt or "",
            "prompt_source": doc.prompt_source or "",
            "prompt_id": doc.prompt_id or "",
            "generation_params": json.dumps(doc.generation_params, ensure_ascii=False),
            "created_at": doc.created_at.isoformat()
        }
    
    # 检查是否已存在
    existing = collection.get(ids=[doc.id])
    is_new = len(existing["ids"]) == 0
    
    # 执行 upsert
    collection.upsert(
        ids=[doc.id],
        embeddings=[embedding],
        documents=[embed_input],
        metadatas=[metadata]
    )
    
    action = "新增" if is_new else "更新"
    print(f"[ChromaStore] ✅ {action} 文档: {doc.id} ({doc.source_type})")
    return is_new


async def get_all_documents(source_type: Optional[str] = None, limit: int = 100, offset: int = 0) -> list[dict]:
    """获取所有文档（用于后台展示）"""
    results = []
    
    collections_to_query = []
    if source_type in ["xhs_covers", "xhs_covers_v1", "xhs_covers_v2"]:
        collections_to_query = [("xhs_covers", get_xhs_collection())]
    elif source_type in ["version_gallery", "version_gallery_v1", "version_gallery_v2"]:
        collections_to_query = [("version_gallery", get_gallery_collection())]
    else:
        collections_to_query = [
            ("xhs_covers", get_xhs_collection()),
            ("version_gallery", get_gallery_collection())
        ]
    
    for coll_name, collection in collections_to_query:
        try:
            data = collection.get(
                limit=limit,
                offset=offset,
                include=["metadatas", "documents"]
            )
            for i, doc_id in enumerate(data["ids"]):
                meta = data["metadatas"][i] if data["metadatas"] else {}
                # 解析 JSON 字段
                try:
                    style_tags = json.loads(meta.get("style_tags", "[]"))
                except:
                    style_tags = []
                
                try:
                    user_tags = json.loads(meta.get("user_tags", "[]"))
                except:
                    user_tags = []
                    
                results.append({
                    "id": doc_id,
                    "source_type": meta.get("source_type", coll_name),
                    "title": meta.get("title", ""),
                    "content": meta.get("content", ""),
                    "image_url": meta.get("image_url", ""),
                    "all_images": json.loads(meta.get("all_images", "[]")) if meta.get("all_images") else [],
                    "visual_description": meta.get("visual_description") or (data["documents"][i] if data["documents"] else "")[:200],
                    "style_tags": style_tags,
                    "user_tags": user_tags,
                    "group_id": meta.get("group_id", ""),
                    "folder_name": meta.get("folder_name", ""),
                    "prompt": meta.get("prompt", ""),
                    "prompt_source": meta.get("prompt_source", ""),
                    "prompt_id": meta.get("prompt_id", ""),
                    "rating": meta.get("rating", "unrated"),
                    "skill_name": meta.get("skill_name", ""),
                    "likes": meta.get("likes", 0),
                    "collected_count": meta.get("collected_count", 0),
                    "comment_count": meta.get("comment_count", 0),
                    "url": meta.get("url", ""),
                    "created_at": meta.get("created_at", "")
                })
        except Exception as e:
            print(f"[ChromaStore] 查询 {coll_name} 失败: {e}")
    
    return results


async def update_gallery_metadata(doc_id: str, updates: dict) -> bool:
    """更新图库文档的元数据 (如 user_tags)"""
    collection = get_gallery_collection()
    try:
        existing = collection.get(ids=[doc_id])
        if not existing["ids"]:
            return False
            
        # 合并 metadata
        old_meta = existing["metadatas"][0] if existing["metadatas"] else {}
        new_meta = {**old_meta}
        
        for k, v in updates.items():
            if isinstance(v, (list, dict)):
                new_meta[k] = json.dumps(v, ensure_ascii=False)
            else:
                new_meta[k] = v
                
        collection.update(
            ids=[doc_id],
            metadatas=[new_meta]
        )
        return True
    except Exception as e:
        print(f"[ChromaStore] 更新元数据失败: {e}")
        return False

async def get_documents_by_ids(doc_ids: list[str]) -> list[dict]:
    """根据 ID 列表批量获取文档详情"""
    if not doc_ids:
        return []
        
    results = []
    # 尝试从各个集合中查找
    for coll_name, collection in [
        ("xhs_covers", get_xhs_collection()),
        ("version_gallery", get_gallery_collection())
    ]:
        try:
            # 过滤属于该集合的 ID
            data = collection.get(
                ids=doc_ids,
                include=["metadatas", "documents"]
            )
            for i, doc_id in enumerate(data["ids"]):
                meta = data["metadatas"][i] if data["metadatas"] else {}
                
                try:
                    style_tags = json.loads(meta.get("style_tags", "[]"))
                except:
                    style_tags = []
                    
                try:
                    user_tags = json.loads(meta.get("user_tags", "[]"))
                except:
                    user_tags = []
                
                results.append({
                    "id": doc_id,
                    "source_type": meta.get("source_type", coll_name),
                    "title": meta.get("title", ""),
                    "content": meta.get("content", ""),
                    "image_url": meta.get("image_url", ""),
                    "all_images": json.loads(meta.get("all_images", "[]")) if meta.get("all_images") else [],
                    "visual_description": meta.get("visual_description") or (data["documents"][i] if data["documents"] else "")[:200],
                    "style_tags": style_tags,
                    "user_tags": user_tags,
                    "group_id": meta.get("group_id", ""),
                    "folder_name": meta.get("folder_name", ""),
                    "prompt": meta.get("prompt", ""),
                    "prompt_source": meta.get("prompt_source", ""),
                    "prompt_id": meta.get("prompt_id", ""),
                    "rating": meta.get("rating", "unrated"),
                    "skill_name": meta.get("skill_name", ""),
                    "likes": meta.get("likes", 0),
                    "collected_count": meta.get("collected_count", 0),
                    "comment_count": meta.get("comment_count", 0),
                    "url": meta.get("url", ""),
                    "created_at": meta.get("created_at", "")
                })
        except Exception as e:
            print(f"[ChromaStore] 批量查询 {coll_name} 失败: {e}")
            
    return results


async def delete_document(doc_id: str) -> bool:
    """删除文档（从所有 collection 中尝试删除）"""
    deleted = False
    for collection in [get_xhs_collection(), get_gallery_collection(), get_knowledge_collection()]:
        try:
            existing = collection.get(ids=[doc_id])
            if existing["ids"]:
                collection.delete(ids=[doc_id])
                deleted = True
                print(f"[ChromaStore] 🗑️ 已删除文档: {doc_id}")
        except Exception as e:
            pass
    return deleted


async def delete_all_documents(source_type: Optional[str] = None) -> int:
    """
    全部删除文档
    :param source_type: 过滤来源: xhs_covers, version_gallery, knowledge_base
    :return: 删除的数量
    """
    total_deleted = 0
    collections_to_check = []
    
    if source_type == "xhs_covers":
        collections_to_check = [get_xhs_collection()]
    elif source_type == "version_gallery":
        collections_to_check = [get_gallery_collection()]
    elif source_type == "knowledge_base":
        collections_to_check = [get_knowledge_collection()]
    else:
        # 默认删除所有业务集合
        collections_to_check = [get_xhs_collection(), get_gallery_collection()]

    for collection in collections_to_check:
        try:
            count = collection.count()
            if count > 0:
                # 获取所有 ID 并删除
                all_ids = collection.get()["ids"]
                if all_ids:
                    collection.delete(ids=all_ids)
                    total_deleted += len(all_ids)
                    print(f"[ChromaStore] 🗑️ 已清空集合 {collection.name}, 删除数量: {len(all_ids)}")
        except Exception as e:
            print(f"[ChromaStore] ❌ 清空集合失败: {e}")
            
    return total_deleted


async def clear_collection(collection_name: str):
    """直接清空指定名称的集合"""
    client = get_chroma_client()
    try:
        client.delete_collection(name=collection_name)
        # 重新创建
        get_collection(collection_name)
        print(f"[ChromaStore] 💥 集合 {collection_name} 已重置")
    except Exception as e:
        print(f"[ChromaStore] ❌ 重置集合 {collection_name} 失败: {e}")


# ─── 知识库专用操作 ──────────────────────────────────────────────────────────

async def upsert_knowledge_chunks(chunks: list) -> int:
    """
    批量写入知识库分块到 ChromaDB（并行 embedding，批次大小 10）

    Args:
        chunks: KnowledgeChunk 列表

    Returns:
        成功写入的数量
    """
    import asyncio

    collection = get_knowledge_collection()
    total = len(chunks)
    success_count = 0
    # ── 使用全局配置中的 EMBED_BATCH_SIZE (目前为 200) ──
    batch_size = EMBED_BATCH_SIZE

    print(f"[ChromaStore] 🚀 开始批量写入 {total} 个分块（批次大小={batch_size}）...")

    from app.rag.vectorstore.embedder import embed_text_batch

    for batch_start in range(0, total, batch_size):
        batch = chunks[batch_start: batch_start + batch_size]
        print(f"[ChromaStore] 正在处理批次 {batch_start//batch_size + 1}, 大小: {len(batch)}")

        # ──  使用真正的异步批量向量化接口，1次请求处理全批次 ──
        try:
            contents = [c.content for c in batch]
            embeddings = await embed_text_batch(contents)
        except Exception as e:
            print(f"[ChromaStore] ❌ 批量 Embedding 失败: {e}")
            embeddings = [[0.0] * 1024] * len(batch)

        # ── 批量 upsert 写入 ChromaDB ────────────────────────────────────
        ids, embs, docs, metas = [], [], [], []
        for chunk, embedding in zip(batch, embeddings):
            ids.append(str(chunk.chunk_id))
            embs.append(embedding)
            docs.append(str(chunk.content))
            metas.append({
                "source_type": str(chunk.source_type),
                "doc_id": str(chunk.doc_id),
                "parent_chunk_id": str(chunk.parent_chunk_id or ""),
                "chunk_type": str(chunk.chunk_type),
                "page_num": int(chunk.page_num or 0),
                "heading_path": str(chunk.heading_path or ""),
                "seq": int(chunk.seq or 0),
                "filename": str(chunk.filename or ""),
                "category": str(chunk.category or "通用"),
                "doc_summary": str(chunk.global_summary or ""),
                "doc_tags": ",".join(chunk.global_tags or []) if chunk.global_tags else "",
                "image_path": str(chunk.image_path or "")  # 持久化图片路径
            })

        try:
            collection.upsert(ids=ids, embeddings=embs, documents=docs, metadatas=metas)
            success_count += len(ids)
        except Exception as e:
            print(f"[ChromaStore] ❌ 批量写入失败: {e}")
            import traceback
            traceback.print_exc()

        done = min(batch_start + batch_size, total)
        print(f"[ChromaStore] 进度: {done}/{total} ✓")

    print(f"[ChromaStore] ✅ 知识库写入完成: {success_count}/{total}")
    return success_count


async def delete_knowledge_document(doc_id: str) -> int:
    """
    按文档 ID 删除该文档的所有分块
    
    Returns:
        删除的分块数量
    """
    collection = get_knowledge_collection()
    try:
        # 查找该文档的所有分块
        results = collection.get(
            where={"doc_id": doc_id},
            include=["metadatas"]
        )
        if results["ids"]:
            collection.delete(ids=results["ids"])
            count = len(results["ids"])
            print(f"[ChromaStore] 🗑️ 已删除文档 {doc_id} 的 {count} 个分块")
            return count
    except Exception as e:
        print(f"[ChromaStore] 删除知识库文档失败: {e}")
    return 0


async def get_knowledge_documents(limit: int = 100, offset: int = 0, category: str = None) -> list[dict]:
    """获取知识库文档列表（聚合到文件级）"""
    collection = get_knowledge_collection()
    try:
        kwargs = {"include": ["metadatas"]}
        if category:
            kwargs["where"] = {"category": category}
        
        data = collection.get(**kwargs)
        
        # 聚合：按 doc_id 分组
        doc_map = {}
        for i, chunk_id in enumerate(data["ids"]):
            meta = data["metadatas"][i] if data["metadatas"] else {}
            did = meta.get("doc_id", "")
            if did not in doc_map:
                doc_map[did] = {
                    "doc_id": did,
                    "filename": meta.get("filename", ""),
                    "category": meta.get("category", "通用"),
                    "source_type": "knowledge_base",
                    "total_chunks": 0,
                    "doc_summary": meta.get("doc_summary", ""),
                    "doc_tags": meta.get("doc_tags", ""),
                    "chunk_types": {}
                }
            doc_map[did]["total_chunks"] += 1
            ct = meta.get("chunk_type", "child")
            doc_map[did]["chunk_types"][ct] = doc_map[did]["chunk_types"].get(ct, 0) + 1
        
        docs = list(doc_map.values())[offset:offset + limit]
        return docs
    except Exception as e:
        print(f"[ChromaStore] 查询知识库文档列表失败: {e}")
        return []


async def get_parent_chunk(parent_chunk_id: str) -> Optional[dict]:
    """Parent 回溯：根据 parent_chunk_id 获取完整的父块内容"""
    if not parent_chunk_id:
        return None
    collection = get_knowledge_collection()
    try:
        data = collection.get(
            ids=[parent_chunk_id],
            include=["metadatas", "documents"]
        )
        if data["ids"]:
            return {
                "chunk_id": data["ids"][0],
                "content": data["documents"][0] if data["documents"] else "",
                "metadata": data["metadatas"][0] if data["metadatas"] else {}
            }
    except Exception as e:
        print(f"[ChromaStore] Parent 回溯失败: {e}")
    return None



async def get_stats() -> dict:
    """获取知识库统计信息"""
    try:
        xhs_count = get_xhs_collection().count()
        gallery_count = get_gallery_collection().count()
        knowledge_count = get_knowledge_collection().count()
        favorites_count = get_favorites_collection().count()
    except Exception as e:
        xhs_count = 0
        gallery_count = 0
        knowledge_count = 0
        favorites_count = 0
    
    return {
        "total": xhs_count + gallery_count + knowledge_count + favorites_count,
        "xhs_covers": xhs_count,
        "version_gallery": gallery_count,
        "knowledge_base": knowledge_count,
        "favorited_images": favorites_count,
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }


async def vector_search(
    query_embedding: list[float],
    collection_names: list[str],
    top_k: int = 20,
    where: Optional[dict] = None
) -> list[dict]:
    """向量相似度检索"""
    results = []
    
    for coll_name in collection_names:
        try:
            if coll_name in ["xhs_covers", "xhs_covers_v1", "xhs_covers_v2"]:
                collection = get_xhs_collection()
            elif coll_name in ["knowledge_base", "knowledge_base_v1", "knowledge_base_v2"]:
                collection = get_knowledge_collection()
            else:
                collection = get_gallery_collection()
            
            kwargs = {
                "query_embeddings": [query_embedding],
                "n_results": min(top_k, collection.count() or 1),
                "include": ["metadatas", "documents", "distances"]
            }
            if where:
                kwargs["where"] = where
            
            data = collection.query(**kwargs)
            
            for i, doc_id in enumerate(data["ids"][0]):
                meta = data["metadatas"][0][i] if data["metadatas"] else {}
                distance = data["distances"][0][i] if data["distances"] else 1.0
                # 将距离转换为相似度分数（余弦距离越小越相似）
                score = 1.0 - distance
                
                try:
                    style_tags = json.loads(meta.get("style_tags", "[]"))
                except:
                    style_tags = []
                
                results.append({
                    "doc_id": doc_id,
                    "score": score,
                    "source_type": meta.get("source_type", coll_name),
                    "image_url": meta.get("image_url", ""),
                    "visual_description": data["documents"][0][i] if data["documents"] else "",
                    "style_tags": style_tags,
                    "rating": meta.get("rating", "unrated"),
                    "skill_name": meta.get("skill_name", ""),
                    "metadata": meta
                })
        except Exception as e:
            print(f"[ChromaStore] 向量检索 {coll_name} 失败: {e}")
    
    # 按分数排序
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]

async def get_favorite_images(limit: int = 100) -> list[dict]:
    """获取收藏图片列表"""
    collection = get_favorites_collection()
    try:
        data = collection.get(limit=limit, include=["metadatas"])
        results = []
        for i, doc_id in enumerate(data["ids"]):
            meta = data["metadatas"][i] if data["metadatas"] else {}
            results.append({
                "id": doc_id,
                "image_url": meta.get("image_url", ""),
                "doc_id": meta.get("doc_id", ""),
                "title": meta.get("title", ""),
                "created_at": meta.get("created_at", ""),
                "source_type": "xhs_image" # 默认来自笔记
            })
        return results
    except Exception as e:
        print(f"[ChromaStore] 获取收藏图片失败: {e}")
        return []


async def upsert_favorite_image(img_id: str, metadata: dict) -> bool:
    """收藏/更新图片"""
    collection = get_favorites_collection()
    try:
        # 图片收藏由于量不大且主要用于展示，暂时不走向量化，仅存储元数据
        collection.upsert(
            ids=[img_id],
            metadatas=[metadata],
            documents=["[favorited_image]"] # 占位符
        )
        return True
    except Exception as e:
        print(f"[ChromaStore] 收藏图片失败: {e}")
        return False


async def delete_favorite_image(img_id: str) -> bool:
    """取消收藏图片"""
    collection = get_favorites_collection()
    try:
        collection.delete(ids=[img_id])
        return True
    except Exception as e:
        print(f"[ChromaStore] 取消收藏图片失败: {e}")
        return False
