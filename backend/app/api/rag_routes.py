"""
rag_routes.py - RAG 数据管理与对话接口
提供知识库文档同步、分块预览及 RAG 专属对话助手的 API 支持。
接口前缀：/api/v1/rag/
"""
from typing import Optional, List
import asyncio
import hashlib
import tempfile
import os
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

from app.rag.ingestion.xhs_collector import collect_xhs_note, batch_collect_xhs_notes
from app.rag.ingestion.gallery_extractor import extract_from_gallery
from app.rag.vectorstore.chroma_store import (
    upsert_document, get_all_documents, delete_document, get_stats
)
from app.rag.retrieval.bm25_retriever import get_bm25_index
# from app.rag.evaluation.ragas_evaluator import get_ragas_evaluator
from app.core.llm_config import get_llm_config
from app.core.users import current_user
from app.models.user import User
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

router = APIRouter(prefix="/rag", tags=["RAG 知识库管理"])
# 公开路由（如图片服务，无需 Bearer Token）
public_router = APIRouter(prefix="/rag", tags=["RAG 公共服务"])

# 用于存放近期 RAG 的真实交互历史，供 RAGAS 评估用
RAG_QA_HISTORY = []


# ─── 请求/响应模型 ───────────────────────────────────────────────────────────

class IngestUrlRequest(BaseModel):
    url: str


class IngestBatchRequest(BaseModel):
    urls: List[str]


class IngestGalleryRequest(BaseModel):
    version_data: dict  # Version Gallery 单条版本数据


class IngestBatchGalleryRequest(BaseModel):
    versions: List[dict]  # 批量 Version Gallery 版本数据

# 图库管理请求
class UpdateGalleryTagsRequest(BaseModel):
    tags: List[str]

class BatchUpdateGalleryTagsRequest(BaseModel):
    doc_ids: List[str]
    tags: List[str]

class UpdateGalleryFolderRequest(BaseModel):
    folder_name: str


class FavoriteRequest(BaseModel):
    img_id: str
    metadata: dict


class XhsSearchRequest(BaseModel):
    prompt: str
    limit: int = 10


class RewriteRequest(BaseModel):
    text: str
    action: str  # polish, shorten, expand, optimize_prompt
    instructions: Optional[str] = None
    context: Optional[str] = None # 全文上下文


class CanvasSyncRequest(BaseModel):
    content: str


# ─── 接口实现 ────────────────────────────────────────────────────────────────

@router.post("/ingest/url")
async def ingest_single_url(
    request: IngestUrlRequest,
    user: User = Depends(current_user)
):
    """
    导入单条小红书笔记（用户隔离）
    POST /api/v1/rag/ingest/url
    Body: { "url": "https://www.xiaohongshu.com/explore/xxx" }
    """
    try:
        doc = await collect_xhs_note(request.url)
        is_new = await upsert_document(doc, user_id=user.id)

        # 标记 BM25 索引需要重建
        get_bm25_index().mark_dirty()

        return {
            "status": "success",
            "doc_id": doc.id,
            "title": doc.title,
            "image_url": doc.image_url,
            "visual_description": doc.visual_description,
            "style_tags": doc.style_tags,
            "is_new": is_new
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")


@router.post("/ingest/batch")
async def ingest_batch_urls(
    request: IngestBatchRequest,
    user: User = Depends(current_user)
):
    """
    批量导入小红书笔记
    POST /api/v1/rag/ingest/batch
    Body: { "urls": ["https://...", "https://..."] }
    """
    if len(request.urls) > 50:
        raise HTTPException(status_code=400, detail="单次批量导入不超过 50 条")
    
    docs = await batch_collect_xhs_notes(request.urls)
    
    new_count = 0
    updated_count = 0
    failed_count = len(request.urls) - len(docs)
    
    for doc in docs:
        try:
            is_new = await upsert_document(doc, user_id=user.id)
            if is_new: new_count += 1
            else: updated_count += 1
        except Exception as e:
            print(f"批量导入跳过失败文档: {e}")
    
    # 标记 BM25 索引需要重建
    if new_count + updated_count > 0: # Original code had `if new_count > 0:`
        get_bm25_index().mark_dirty()
        
    return {
        "status": "success",
        "new_count": new_count,
        "updated_count": updated_count,
        "failed_count": failed_count
    }

@router.post("/prompts/save")
async def save_prompt_endpoint(request: dict):
    """
    收藏提示词并触发视觉学习
    POST /api/v1/rag/prompts/save
    """
    from app.skills import prompt_optimizer
    prompt = request.get("prompt")
    image_url = request.get("image_url")
    skill_name = request.get("skill_name", "gen-image")
    
    if not prompt:
        raise HTTPException(status_code=400, detail="提示词不能为空")
        
    # 1. 立即持久化到数据库
    success = prompt_optimizer.save_golden_prompt(prompt, image_url, model_used=skill_name)
    
    # 2. 异步触发视觉反馈学习 (后台执行，不阻塞前端)
    from fastapi import BackgroundTasks
    bg = BackgroundTasks()
    bg.add_task(prompt_optimizer.trigger_visual_learning, image_url, prompt, model_used=skill_name)
    
    # 3. 广播给前端刷新 (通过 SSE 之外的机制，这里仅返回成功)
    return {"status": "success", "message": "提示词已进入收藏库，视觉学习已启动"}


@router.get("/prompts")
async def list_golden_prompts_endpoint(limit: int = 1000):
    """
    获取收藏的优质提示词
    GET /api/v1/rag/prompts
    """
    from app.skills import prompt_optimizer
    prompts = prompt_optimizer.load_golden_prompts(limit=limit)
    return {"status": "success", "prompts": prompts}


@router.delete("/prompts/{prompt_id}")
async def delete_prompt_api(prompt_id: str):
    """
    删除提示词
    DELETE /api/v1/rag/prompts/{prompt_id}
    """
    from app.skills import prompt_optimizer
    success = prompt_optimizer.delete_golden_prompt(prompt_id)
    if success:
        return {"status": "success", "message": "Prompt deleted"}
    return {"status": "error", "message": "Failed to delete prompt"}


@router.patch("/prompts/{prompt_id}/tags")
async def update_prompt_tags_api(prompt_id: str, payload: dict):
    """
    更新提示词标签
    PATCH /api/v1/rag/prompts/{prompt_id}/tags
    """
    from app.skills import prompt_optimizer
    tags = payload.get("tags", [])
    success = prompt_optimizer.update_golden_prompt_tags(prompt_id, tags)
    if success:
        return {"status": "success", "message": "Tags updated"}
    return {"status": "error", "message": "Failed to update tags"}


@router.post("/rewrite")
async def rewrite_text(request: RewriteRequest):
    """
    AI 润色/缩写/扩写/提示词优化接口
    POST /api/v1/rag/rewrite
    """
    try:
        from app.core import llm_config
        base_url, api_key = await llm_config.get_llm_config(is_layering=False)
        llm = ChatOpenAI(
            base_url=base_url,
            api_key=api_key,
            # 用高性能模型处理提示词
            model="gpt-4o" if request.action == "optimize_prompt" else "gpt-4o-mini",
            temperature=0.7
        )

        if request.action == "optimize_prompt":
            from app.skills import prompt_optimizer
            system_prompt = prompt_optimizer.build_optimizer_prompt()
            human_content = f"待优化的原始片段: {request.text}"
            if request.instructions:
                human_content += f"\n核心方向: {request.instructions}"
            if request.context:
                human_content += f"\n全量上下文: {request.context}"
        else:
            prompts = {
                "polish": "你是一位资深的小红书文案专家。请对以下选中的文本进行【润色】，使其更有吸引力、情感更丰富、更符合小红书爆款风格。保持原意，但语言更生动。",
                "shorten": "你是一位精准的编辑。请对以下选中的文本进行【缩写/精简】，去掉冗余信息，保留核心要点，使其短小精悍。",
                "expand": "你是一位富有想象力的文案策划。请对以下选中的文本进行【扩写】，添加更多生动的细节 and 描述，使其更充实、更具画面感。"
            }
            system_prompt = prompts.get(request.action, prompts["polish"])
            human_content = f"选中待处理文本如下：\n{request.text}"
            if request.instructions:
                human_content += f"\n\n用户特别指令：{request.instructions}"
            human_content += "\n\n请直接输出优化后的文本结果，不需要任何开场白或解释。"

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content)
        ]
        
        response = await llm.ainvoke(messages)
        result_text = response.content.strip()

        # [Logic Add] 对于提示词优化，后端可能输出的是 JSON，但前端 NoteDetailModal 期待的是纯字符串用于替换/插入
        if request.action == "optimize_prompt" and result_text.startswith("{") or "```json" in result_text:
            try:
                import json, re
                # 提取 JSON 部分
                json_str = result_text
                if "```json" in result_text:
                    json_match = re.search(r"```json\s*([\s\S]*?)\s*```", result_text)
                    if json_match:
                        json_str = json_match.group(1)
                
                data = json.loads(json_str)
                # 优先提取 optimized_prompt 字段
                result_text = data.get("optimized_prompt") or data.get("prompt_cn") or result_text
            except Exception as e:
                print(f"[RAG Rewrite] JSON Parse failed, fallback to raw text: {e}")

        return {"status": "success", "result": result_text}
        
    except Exception as e:
        print(f"[RAG Rewrite] ❌ Error: {e}")
        raise HTTPException(status_code=500, detail=f"润色失败: {str(e)}")


@router.post("/ingest/gallery")
async def ingest_gallery_version(
    request: IngestGalleryRequest,
    user: User = Depends(current_user)
):
    """
    从 Version Gallery 收藏版本到知识库（用户隔离）
    POST /api/v1/rag/ingest/gallery
    Body: { "version_data": { "version_id": "...", "image_url": "...", ... } }
    """
    try:
        doc = await extract_from_gallery(request.version_data)
        is_new = await upsert_document(doc, user_id=user.id)
        
        # 标记 BM25 需要重建
        get_bm25_index().mark_dirty()
        
        return {
            "status": "success",
            "doc_id": doc.id,
            "image_url": doc.image_url,
            "visual_description": doc.visual_description,
            "style_tags": doc.style_tags,
            "rating": doc.rating,
            "is_new": is_new
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"收藏失败: {str(e)}")


@router.delete("/documents/{doc_id}")
async def delete_rag_document(
    doc_id: str,
    user: User = Depends(current_user)
):
    """
    从知识库/灵感库删除文档（用户隔离）
    DELETE /api/v1/rag/documents/{doc_id}
    """
    try:
        success = await delete_document(doc_id, user_id=user.id)
        if not success:
            raise HTTPException(status_code=404, detail="文档不存在或删除失败")
        
        # 标记 BM25 需要更新
        get_bm25_index().mark_dirty()
        
        return {"status": "success", "message": f"文档 {doc_id} 已删除"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[RAG Routes] ❌ 删除文档 {doc_id} 异常: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest/gallery/batch")
async def ingest_gallery_batch(
    request: IngestBatchGalleryRequest,
    user: User = Depends(current_user)
):
    """
    批量同步 Version Gallery 历史版本（用户隔离）
    POST /api/v1/rag/ingest/gallery/batch
    Body: { "versions": [...] }
    """
    new_count = 0
    updated_count = 0
    failed_count = 0

    for version_data in request.versions:
        try:
            doc = await extract_from_gallery(version_data)
            is_new = await upsert_document(doc, user_id=user.id)
            if is_new:
                new_count += 1
            else:
                updated_count += 1
        except Exception as e:
            failed_count += 1
            print(f"[RAG Routes] 批量收藏失败: {e}")
    
    if new_count + updated_count > 0:
        get_bm25_index().mark_dirty()
    
    return {
        "status": "success",
        "total": len(request.versions),
        "new": new_count,
        "updated": updated_count,
        "failed": failed_count
    }


@router.get("/documents")
async def list_documents(
    source_type: Optional[str] = Query(None, description="过滤来源: xhs_covers 或 version_gallery"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user)
):
    """
    获取知识库所有条目
    GET /api/v1/rag/documents?source_type=xhs_covers&limit=50&offset=0
    """
    docs = await get_all_documents(source_type=source_type, limit=limit, offset=offset, user_id=user.id)
    return {
        "status": "success",
        "count": len(docs),
        "documents": docs
    }


@router.get("/documents/batch")
async def get_documents_batch(ids: str = Query(..., description="中英文逗号分隔的文档 ID 列表")):
    """
    批量获取指定 ID 的文档详情
    GET /api/v1/rag/documents/batch?ids=xhs_123,xhs_456
    """
    from app.rag.vectorstore.chroma_store import get_documents_by_ids
    doc_ids = [i.strip() for i in ids.replace('，', ',').split(',') if i.strip()]
    if not doc_ids:
        return {"status": "success", "documents": []}
        
    docs = await get_documents_by_ids(doc_ids)
    return {
        "status": "success",
        "count": len(docs),
        "documents": docs
    }


@router.delete("/documents/{doc_id}")
async def delete_document_by_id(doc_id: str):
    """
    删除单条文档
    DELETE /api/v1/rag/documents/{doc_id}
    """
    deleted = await delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"文档 {doc_id} 不存在")
    
    # 重建 BM25 索引
    get_bm25_index().mark_dirty()
    
    return {"status": "success", "deleted_id": doc_id}


@router.delete("/documents/actions/clear")
async def clear_all_documents(
    source_type: Optional[str] = Query(None, description="过滤来源: xhs_covers 或 version_gallery"),
    user: User = Depends(current_user)
):
    """
    清空当前用户的所有文档
    DELETE /api/v1/rag/documents/actions/clear?source_type=xhs_covers
    """
    from app.rag.vectorstore.chroma_store import delete_all_documents

    count = await delete_all_documents(source_type=source_type, user_id=user.id)

    # 重建 BM25 索引
    get_bm25_index().mark_dirty()

    return {"status": "success", "cleared_count": count}


@router.get("/stats")
async def get_knowledge_stats(user: User = Depends(current_user)):
    """
    获取当前用户的知识库统计信息
    GET /api/v1/rag/stats
    Response: { "total": 156, "xhs_covers": 132, "version_gallery": 24, "knowledge_base": 0 }
    """
    stats = await get_stats(user_id=user.id)
    return stats


@router.post("/xhs/search")
async def search_xhs_inspiration(request: XhsSearchRequest):
    """
    流式执行：小红书实时搜索 -> 自动入库
    POST /api/v1/rag/xhs/search
    """
    from app.services.xhs_service import search_xhs_livesearch
    
    res = await search_xhs_livesearch(request.prompt, request.limit)
    if res.get("status") == "error":
        raise HTTPException(status_code=500, detail=res.get("message"))
    
    return res


@router.get("/xhs/detail/{note_id}")
async def get_xhs_note_detail(note_id: str):
    """
    获取小红书笔记详情 (从 MCP 实时拉取)
    """
    from app.rag.vectorstore.chroma_store import get_xhs_collection
    
    # 1. 先尝试获取本地存储的 xsec_token
    collection = get_xhs_collection()
    doc_id = f"xhs_{note_id}"
    res = collection.get(ids=[doc_id])
    
    xsec_token = ""
    if res and res["metadatas"]:
        meta = res["metadatas"][0]
        print(f"[RAG Detail] 🔍 检索到元数据字段: {list(meta.keys())}")
        
        # 1. 优先从专用字段获取 (新导入的数据)
        if meta.get("xsec_token"):
            xsec_token = meta.get("xsec_token")
            print(f"[RAG Detail] ✅ 从 metadata.xsec_token 获取到令牌")
        
        # 2. 兜底：从 style_tags 解析 (旧的搜索结果数据)
        if not xsec_token:
            try:
                raw_tags = meta.get("style_tags", "[]")
                tags = json.loads(raw_tags) if isinstance(raw_tags, str) else (raw_tags or [])
                for t in tags:
                    if isinstance(t, str) and t.startswith("xsec_token:"):
                        xsec_token = t.split(":", 1)[1]
                        print(f"[RAG Detail] ✅ 从 style_tags 解析到令牌")
                        break
            except Exception as e:
                print(f"[RAG Detail] ❌ 解析标签失败: {e}")
    else:
        print(f"[RAG Detail] ❌ Collection 中未找到文档: {doc_id}")

    # 2. 如果没有 token，直接报错
    if not xsec_token:
        print(f"[RAG Detail] ❌ 未找到 xsec_token for {note_id}, 无法获取详情")
        return {"status": "error", "message": "该笔记缺少访问令牌，无法查看详情。请尝试重新搜索加载。"}
        
    # 3. 本地数据优先：如果已有正文，不再发起实时抓取 (提速 & 避错)
    body_content = meta.get("content", "")
    if body_content:
        # 尝试还原多图列表
        try:
            raw_all_images = meta.get("all_images", "[]")
            all_images = json.loads(raw_all_images) if isinstance(raw_all_images, str) else (raw_all_images or [])
            # 规范化：如果存储的是字符串 URL 列表，将其转换为前端期望的对象列表
            if all_images and isinstance(all_images[0], str):
                all_images = [{"urlDefault": url} for url in all_images]
        except:
            all_images = [{"urlDefault": meta.get("image_url", "")}]
            
        print(f"[RAG Detail] ⚡️ 本地命中正文 (长度: {len(body_content)})，跳过实时抓取")
        cached_note = {
            "title": meta.get("title", ""),
            "desc": body_content,
            "interactInfo": {
                "likedCount": str(meta.get("likes", 0)),
                "collectedCount": str(meta.get("collected_count", 0)),
                "commentCount": str(meta.get("comment_count", 0))
            },
            "user": {"nickname": "小红书笔记", "avatar": ""},
            "image_list": all_images if all_images else [{"urlDefault": meta.get("image_url", "")}]
        }
        return {
            "status": "success",
            "detail": {"note": cached_note, "is_cached": True}
        }

    from app.tools.xhs_mcp_tools import XHSMCPTools
    # 4. 只有本地没有正文时，才发起实时抓取
    print(f"[RAG Detail] 🚀 正在发起实时深度抓取: {note_id}")
    detail = await XHSMCPTools.get_feed_detail(note_id, xsec_token, load_all_comments=False, limit=1)
    
    # 5. 如果实时抓取失败，使用本地元数据最后回退
    if "error" in detail or (not detail.get("note") and not detail.get("note_card")):
        print(f"[RAG Detail] ⚠️ 实时抓取失败 (可能是缓存过期)，切换至本地数据库最终回退: {note_id}")
        # 从 doc["documents"] 中获取原始正文（可能包含标题等）作为保底
        raw_content = res["documents"][0] if res.get("documents") else ""
        # 优先使用 metadata["content"]，这是真正的纯正文
        body_content = meta.get("content") or raw_content or ""
        
        print(f"[RAG Detail] ✅ 本地数据恢复成功: 正文长度 {len(body_content)} 字符")
        
        fallback_note = {
            "title": meta.get("title", ""),
            "desc": body_content,
            "interactInfo": {
                "likedCount": str(meta.get("likes", 0)),
                "collectedCount": str(meta.get("collected_count", 0)),
                "commentCount": str(meta.get("comment_count", 0))
            },
            "user": {"nickname": "小红书笔记", "avatar": ""},
            "image_list": [{"urlDefault": meta.get("image_url", "")}]
        }
        return {
            "status": "success",
            "detail": {"note": fallback_note, "is_fallback": True}
        }
    
    return {
        "status": "success",
        "detail": detail
    }


@router.post("/canvas/sync")
async def sync_to_canvas(request: CanvasSyncRequest):
    """
    接收来自灵感库/对话助手的文案同步请求。
    目前主要用于后端记录，前端通过状态管理完成实时呈现。
    """
    print(f"[RAG Canvas Sync] 📥 收到文案同步请求: {len(request.content)} 字符")
    # 未来可扩展为存入数据库或 Redis
    return {"status": "success", "message": "文案已同步"}


# ─── 通用知识库路由 ──────────────────────────────────────────────────────────


@router.post("/knowledge/upload")
async def upload_knowledge_document(
    file: UploadFile = File(...),
    category: str = Form("通用资料"),
    tags: str = Form(""),
    user: User = Depends(current_user)
):
    """
    上传文档到通用知识库
    POST /api/v1/rag/knowledge/upload (multipart/form-data)
    支持: PDF / Word / Excel
    """
    from app.rag.ingestion.doc_parser import parse_document, SUPPORTED_TYPES
    from app.rag.ingestion.doc_chunker import chunk_document_with_llama
    from app.rag.vectorstore.chroma_store import upsert_knowledge_chunks

    # 验证文件类型
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_TYPES:
        supported = ", ".join(SUPPORTED_TYPES.keys())
        raise HTTPException(status_code=400, detail=f"不支持的文件格式: {ext}。支持: {supported}")

    # 限制文件大小 (20MB)
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小不能超过 20MB")

    # 生成文档 ID
    doc_id = f"kb_{hashlib.md5(content).hexdigest()[:12]}"

    # 保存到临时文件
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # 解析文档
        parsed = parse_document(tmp_path)
        # 显式保留原始文件名，防止使用临时文件名（如 tmpxxx.docx）
        parsed.filename = file.filename

        # [CRITICAL FIX] 触发 LLM 增强流程 (包含文档摘要、标签生成以及图片的 Vision/OCR 处理)
        await parsed.enrich_with_llm()

        # 智能分块 (LlamaIndex 驱动)
        chunks = await chunk_document_with_llama(parsed, doc_id=doc_id, category=category)

        # 写入 ChromaDB（带上 user_id 实现用户隔离）
        success_count = await upsert_knowledge_chunks(chunks, user_id=user.id)

        # 标记 BM25 索引需要重建
        get_bm25_index().mark_dirty()

        # 解析标签
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        return {
            "status": "success",
            "doc_id": doc_id,
            "filename": file.filename,
            "file_type": ext.lstrip("."),
            "file_size": len(content),
            "total_chunks": success_count,
            "total_pages": parsed.total_pages,
            "image_count": len(parsed.images),
            "category": category,
            "tags": tag_list,
            "sections_found": len(parsed.sections)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"文档处理失败: {str(e)}")
    finally:
        # 清理临时文件
        try:
            os.unlink(tmp_path)
        except:
            pass


from pathlib import Path
@public_router.get("/images/{category}/{image_id}")
async def get_rag_image(category: str, image_id: str):
    from fastapi.responses import FileResponse
    from app.rag.ingestion.doc_parser import _get_images_dir

    # 统一获取物理目录
    base_knowledge_dir = Path(_get_images_dir())
    # 使用当前文件绝对路径定位 data/rag_images，避免相对路径因启动目录不同而 404
    base_storage = Path(__file__).parent.parent.parent / "data" / "rag_images"

    if category == "knowledge":
        file_path = base_knowledge_dir / image_id
    else:
        file_path = base_storage / category / image_id
        
    # 自动补全后缀逻辑
    if not file_path.exists() and "." not in image_id:
        for ext in [".jpg", ".png", ".webp", ".jpeg"]:
            if (file_path.with_suffix(ext)).exists():
                file_path = file_path.with_suffix(ext)
                break
                
    if not file_path.exists(): 
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found in {file_path}")
        
    return FileResponse(file_path)

@public_router.get("/knowledge/images/{image_id}")
async def get_knowledge_image(image_id: str):
    return await get_rag_image("knowledge", image_id)


@router.get("/knowledge/documents")
async def list_knowledge_documents(
    category: Optional[str] = Query(None, description="按分类过滤"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user)
):
    """
    获取知识库文档列表（文件级，用户隔离）
    GET /api/v1/rag/knowledge/documents?category=品牌指南
    """
    from app.rag.vectorstore.chroma_store import get_knowledge_documents
    docs = await get_knowledge_documents(limit=limit, offset=offset, category=category, user_id=user.id)
    return {
        "status": "success",
        "count": len(docs),
        "documents": docs
    }


@router.delete("/knowledge/documents/{doc_id}")
async def delete_knowledge_doc(
    doc_id: str,
    user: User = Depends(current_user)
):
    """
    删除知识库文档及其所有分块
    DELETE /api/v1/rag/knowledge/documents/{doc_id}
    """
    from app.rag.vectorstore.chroma_store import delete_knowledge_document
    count = await delete_knowledge_document(doc_id, user_id=user.id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"文档 {doc_id} 不存在或无权限")

    get_bm25_index().mark_dirty()
    return {"status": "success", "deleted_id": doc_id, "deleted_chunks": count}


@router.get("/knowledge/documents/{doc_id}/chunks")
async def preview_document_chunks(
    doc_id: str,
    limit: int = Query(500, ge=1, le=1000)
):
    """
    预览文档的所有分块
    GET /api/v1/rag/knowledge/documents/{doc_id}/chunks
    """
    from app.rag.vectorstore.chroma_store import get_knowledge_collection
    collection = get_knowledge_collection()
    try:
        data = collection.get(
            where={"doc_id": doc_id},
            include=["metadatas", "documents"],
            limit=limit
        )
        chunks = []
        for i, chunk_id in enumerate(data["ids"]):
            meta = data["metadatas"][i] if data["metadatas"] else {}
            
            # 弹性解析 global_tags (Chroma 存储的是 JSON 字符串)
            import json
            raw_tags = meta.get("global_tags", "[]")
            try:
                key_tags = json.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags
            except:
                key_tags = []

            chunks.append({
                "chunk_id": chunk_id,
                "chunk_type": meta.get("chunk_type", "child"),
                "parent_chunk_id": meta.get("parent_chunk_id"),
                "page_num": meta.get("page_num", 0),
                "heading_path": meta.get("heading_path", ""),
                "filename": meta.get("filename", ""),
                "category": meta.get("category", ""),
                "seq": meta.get("seq", 0),
                "image_path": meta.get("image_path", ""), # 显式下发图片路径供前端渲染
                "content_preview": (data["documents"][i] or "")[:500],
                "metadata": {
                    **meta,
                    "key_tags": key_tags # 对齐前端字段名
                }
            })
        # 按 seq 排序
        chunks.sort(key=lambda x: x["seq"])
        return {"status": "success", "doc_id": doc_id, "total": len(chunks), "chunks": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询分块失败: {str(e)}")


class KnowledgeSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    category: Optional[str] = None
    doc_id: Optional[str] = None


@router.post("/knowledge/search")
async def search_knowledge_base(request: KnowledgeSearchRequest):
    """
    知识库专属搜索
    POST /api/v1/rag/knowledge/search
    Body: { "query": "品牌色彩规范", "top_k": 10 }
    """
    from app.rag.retrieval.llama_retriever import get_query_fusion_retriever
    from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
    
    # 构建元数据过滤器
    filters = None
    if request.doc_id:
        filters = MetadataFilters(filters=[
            ExactMatchFilter(key="doc_id", value=request.doc_id)
        ])
    
    # 获取针对知识库的融合检索器 (统一指向 knowledge_base)
    retriever = get_query_fusion_retriever(
        collection_name="knowledge_base", 
        top_k=request.top_k,
        filters=filters
    )
    nodes = await retriever.aretrieve(request.query)
    
    # 转换为统一的 kb_results 格式
    kb_results = []
    for node in nodes:
        kb_results.append({
            "doc_id": node.node.node_id,
            "visual_description": node.node.get_content(),
            "rrf_score": getattr(node, "score", 0),
            "metadata": node.node.metadata,
            "source_type": "knowledge_base"
        })

    # 如果指定了分类，进一步过滤
    if request.category:
        kb_results = [r for r in kb_results if r.get("metadata", {}).get("category") == request.category]

    return {
        "status": "success",
        "query": request.query,
        "count": len(kb_results),
        "results": [
            {
                "chunk_id": r.get("doc_id", ""),
                "content": r.get("visual_description", "")[:1000],
                "heading_path": r.get("metadata", {}).get("heading_path", ""),
                "filename": r.get("metadata", {}).get("filename", ""),
                "category": r.get("metadata", {}).get("category", ""),
                "page_num": r.get("metadata", {}).get("page_num", ""),
                "score": r.get("rrf_score", 0),
                "metadata": r.get("metadata", {})
            }
            for r in kb_results[:request.top_k]
        ]
    }

# ─── RAG 对话助手 ──────────────────────────────────────────────────────────

class RagChatRequest(BaseModel):
    message: str
    conversationId: str = "default"
    history: Optional[List[dict]] = []
    extraContext: Optional[dict] = None  # 携带文档摘要和标签

async def rag_chat_generator(request: RagChatRequest):
    """
    RAG 专属 SSE 生成器：检索知识库 -> 生成回答 -> 流式推送
    """
    import sys
    import hashlib
    import json
    from app.core import llm_config, prompts
    
    print(f"\nDEBUG: [RAG] 🚀 New Request: {request.message}", flush=True)
    
    ai_msg_id = f"ai_{hashlib.md5(request.message.encode()).hexdigest()[:8]}"
    
    try:
        # 1. 发送检索中状态
        payload = json.dumps({'type': 'thought_chunk', 'content': '🔍 正在初始化 Retrieval 进程...\n'}, ensure_ascii=False)
        yield f"data: {payload}\n\n"
        sys.stdout.flush()

        # 2. 调用检索流 (使用事件流模式捕获中间过程)
        from app.rag.retrieval.workflow import StyleRetrievalWorkflow, QueryRewriteEvent
        print(f"DEBUG: [RAG Route] 🚀 Initializing Workflow for query: '{request.message[:30]}'")
        wf = StyleRetrievalWorkflow(timeout=90)
        
        # 选中文档识别与集合动态切换逻辑
        collection = "knowledge_base"
        selected_ids = []
        if request.extraContext and "selectedDocIds" in request.extraContext:
            selected_ids = request.extraContext["selectedDocIds"]
            if selected_ids:
                # 凡是带有 xhs_ 前缀的，都去 xhs_covers_v2 找（对应灵感笔记库）
                if any(sid.startswith("xhs_") for sid in selected_ids):
                    collection = "xhs_covers_v2"
                elif any(sid.startswith("kb_") for sid in selected_ids):
                    collection = "knowledge_base"
                print(f"DEBUG: [RAG Route] 🎯 Detected selected documents: {selected_ids}, switching to collection: {collection}")

        search_results = []
        handler = wf.run(
            query=request.message, 
            collection=collection,
            selected_doc_ids=selected_ids,  # 透传勾选 ID
            extra_context=request.extraContext  #  透传上下文到工作流
        )
        
        # 实时捕获工作流中的事件
        print(f"DEBUG: [RAG Route] 🌐 Workflow started, waiting for events...")
        async for event in handler.stream_events():
            event_type = type(event).__name__
            print(f"DEBUG: [RAG Route] 📥 Received event: {event_type}")
            
            # 使用类名字符串判断，防止由于导入路径差异导致的 isinstance 失效
            if event_type == "ProgressEvent" or hasattr(event, "msg"):
                msg = getattr(event, "msg", "")
                if msg:
                    yield f"data: {json.dumps({'type': 'thought_chunk', 'content': msg}, ensure_ascii=False)}\n\n"
            
            elif event_type == "QueryRewriteEvent" or hasattr(event, "rewritten_queries"):
                queries = getattr(event, "rewritten_queries", [])
                if queries:
                    print(f"DEBUG: [RAG Route] ✨ Captured Rewritten Queries: {queries}")
                    # 推送改写后的问题给前端看板
                    yield f"data: {json.dumps({'type': 'rewritten_queries', 'queries': queries}, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.1)
                
            if event_type == "StopEvent":
                print(f"DEBUG: [RAG Route] 🏁 StopEvent received in stream, breaking loop.")
                break
        
        print(f"DEBUG: [RAG Route] ⌛ Waiting for workflow handler result...")
        wf_result = await handler
        print(f"DEBUG: [RAG Route] 📦 Workflow finished, got result keys: {list(wf_result.keys()) if wf_result else 'None'}")
        search_results = wf_result.get("results", [])
        stats = wf_result.get("stats", {})
        
        # 推送检索统计数据
        if stats:
            print(f"DEBUG: [RAG Route] 📈 Sending retrieval_stats: {stats}")
            yield f"data: {json.dumps({'type': 'retrieval_stats', 'stats': stats}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.1)

        # [Fallback] 如果 SSE 流中没抓到（比如并发竞争），则从最终结果中兜底推送一次
        final_queries = wf_result.get("rewritten_queries", [])
        if final_queries:
            print(f"DEBUG: [RAG Route] 🛡️ Fallback push for rewritten_queries: {final_queries}")
            yield f"data: {json.dumps({'type': 'rewritten_queries', 'queries': final_queries}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.1)

        # 3. 提取引用来源
        sources = []
        context_parts = []
        for i, res in enumerate(search_results):
            meta = res.get("metadata", {})
            filename = meta.get("filename", "未知文档")
            page = meta.get("page_num", "?")
            sources.append(f"{filename} (P{page})")
            # 兼容多种文本字段
            text_chunk = res.get("visual_description") or meta.get("content") or meta.get("text") or ""
            context_parts.append(f"资料[{i+1}] ({filename}): {text_chunk}")
        
        sources = list(set(sources)) # 去重
        context_str = "\n\n".join(context_parts) if context_parts else "（未找到直接匹配的知识，请根据通识建议回答）"

        # 2.5 推送检索原始数据给前端 UI (用于展示“召回片段详情”)
        if search_results:
            ui_results = []
            for res in search_results:
                meta = res.get("metadata", {})
                pure_content = meta.get("content") or res.get("visual_description", "")
                ui_results.append({
                    "chunk_id": res.get("doc_id"),
                    "content": pure_content,
                    "score": res.get("score") or 0.0,
                    "metadata": meta
                })
            yield f"data: {json.dumps({'type': 'retrieval_results', 'results': ui_results}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)

        # 4. 组装 LLM 请求
        from app.rag.config import ONLINE_LLM_MODEL
        base_url, api_key = await llm_config.get_llm_config()
        print(f"DEBUG: [rag_chat_generator] 🤖 Generating response using model: {ONLINE_LLM_MODEL}")
        llm = ChatOpenAI(
            model=ONLINE_LLM_MODEL,
            api_key=api_key,
            base_url=base_url,
            temperature=0.1,
            streaming=True
        )

        history_str = ""
        if request.history:
            history_str = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in request.history[-5:]])

        sys_prompt = prompts.KNOWLEDGE_QA["system"]
        user_prompt = prompts.KNOWLEDGE_QA["user"].format(
            context=context_str,
            history=history_str,
            query=request.message
        )
        print(f"DEBUG: [rag_chat_generator] 📝 Prompt prepared. Sys length: {len(sys_prompt)}, User length: {len(user_prompt)}")

        # 5. 流式生成回答 (切换为原生 AsyncOpenAI 以提高稳定性)
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        
        full_reply = ""
        print(f"DEBUG: [rag_chat_generator] 🚀 Starting LLM stream for model: {ONLINE_LLM_MODEL}")
        
        try:
            response = await client.chat.completions.create(
                model=ONLINE_LLM_MODEL,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                stream=True
            )
            
            async for chunk in response:
                if not chunk.choices:
                    continue
                content = chunk.choices[0].delta.content
                if content:
                    if not full_reply:
                        print(f"DEBUG: [rag_chat_generator] ⚡ First chunk received: '{content[:10]}...'")
                    full_reply += content
                    payload = json.dumps({'type': 'reply', 'content': content}, ensure_ascii=False)
                    yield f"data: {payload}\n\n"
            
            print(f"DEBUG: [rag_chat_generator] ✅ Stream finished. Total length: {len(full_reply)}")
        except Exception as stream_err:
            print(f"DEBUG: [rag_chat_generator] ❌ Stream error: {stream_err}")
            raise stream_err
        
        # 把这次真实的对话记下来，留作评估
        contexts_list = [res.get("visual_description", "") for res in search_results] if search_results else []
        RAG_QA_HISTORY.insert(0, {
            "question": request.message,
            "contexts": contexts_list,
            "answer": full_reply,
            "ground_truth": "" # 在线评估没有真实的参考答案
        })
        # 限制历史条数，比如最多保留近年 50 条
        if len(RAG_QA_HISTORY) > 50:
            RAG_QA_HISTORY.pop()
        
        # 6. 推送引用来源 (包装为 UI 后半部分)
        if sources:
            source_text = f"\n\n---\n**引用来源：**\n" + "\n".join([f"- {s}" for s in sources])
            yield f"data: {json.dumps({'type': 'reply', 'content': source_text}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    except Exception as e:
        import traceback
        print(f"DEBUG: [rag_chat_generator] ❌ Error in RAG flow: {str(e)}")
        traceback.print_exc()
        yield f"data: {json.dumps({'type': 'error', 'message': f'RAG 检索异常: {str(e)}'}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

@router.post("/chat/run")
async def run_rag_chat(request: RagChatRequest):
    """
    RAG 专属流式对话接口
    POST /api/v1/rag/chat/run
    """
    return StreamingResponse(
        rag_chat_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# ─── 评估接口 (异步化重构) ───────────────────────────────────────────────────

from fastapi import BackgroundTasks
from datetime import datetime
import uuid

# 内存中的评估任务状态
EVAL_TASKS = {}
# 内存评估历史
EVAL_HISTORY = []

class EvalRunRequest(BaseModel):
    conversation_id: str = "default"
    limit: int = 5 

async def _bg_run_evaluation(task_id: str, samples: List[dict]):
    """执行 RAGAS 评估的后台任务"""
    from app.rag.evaluation.ragas_evaluator import get_ragas_evaluator
    
    EVAL_TASKS[task_id]["status"] = "processing"
    try:
        evaluator = await get_ragas_evaluator()
        report = await evaluator.batch_evaluate(samples)
        
        # 更新任务状态
        EVAL_TASKS[task_id].update({
            "status": "completed",
            "completed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "result": report
        })
        
        # 同步到历史记录
        EVAL_HISTORY.insert(0, {
            "task_id": task_id,
            "timestamp": EVAL_TASKS[task_id]["completed_at"],
            "status": "completed",
            "summary": report.get("summary", {})
        })
    except Exception as e:
        EVAL_TASKS[task_id].update({
            "status": "failed",
            "error": str(e)
        })

@router.post("/evaluation/run")
async def run_ragas_evaluation(request: EvalRunRequest, background_tasks: BackgroundTasks):
    """
    异步启动 RAGAS 评估
    """
    task_id = str(uuid.uuid4())[:8]
    
    # 使用系统收集到的真实回答记录
    sample_data = RAG_QA_HISTORY[:request.limit]
    
    if not sample_data:
        raise HTTPException(status_code=400, detail="没有足够的真实对话历史用于评估，请先向对话助手提问几个问题！")
    
    EVAL_TASKS[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    background_tasks.add_task(_bg_run_evaluation, task_id, sample_data)
    
    return {"status": "success", "task_id": task_id}

@router.get("/evaluation/status/{task_id}")
async def get_evaluation_status(task_id: str):
    """获取指定评估任务的状态"""
    if task_id not in EVAL_TASKS:
        raise HTTPException(status_code=404, detail="任务不存在")
    return EVAL_TASKS[task_id]

    return {
        "status": "success",
        "history": EVAL_HISTORY
    }

# ─── 图库管理业务接口 (Gallery Management) ───────────────────────────────────

@router.patch("/gallery/{doc_id}/tags")
async def update_gallery_tags_endpoint(
    doc_id: str,
    request: UpdateGalleryTagsRequest,
    user: User = Depends(current_user)
):
    """更新当前用户的图库图片标签"""
    from app.rag.vectorstore.chroma_store import update_gallery_metadata
    success = await update_gallery_metadata(doc_id, {"user_tags": request.tags}, user_id=user.id)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在或无权限")
    return {"status": "success", "doc_id": doc_id, "tags": request.tags}

class UpdateGalleryRatingRequest(BaseModel):
    rating: str

@router.patch("/gallery/{doc_id}/rating")
async def update_gallery_rating_endpoint(doc_id: str, request: UpdateGalleryRatingRequest, user: User = Depends(current_user)):
    """更新图库图片评分 (good/unrated/bad)"""
    from app.rag.vectorstore.chroma_store import update_gallery_metadata
    success = await update_gallery_metadata(doc_id, {"rating": request.rating}, user_id=user.id)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在或无权限")
    return {"status": "success", "doc_id": doc_id, "rating": request.rating}

@router.put("/gallery/batch/tags")
async def batch_update_gallery_tags_endpoint(request: BatchUpdateGalleryTagsRequest):
    """批量更新图库图片标签"""
    from app.rag.vectorstore.chroma_store import update_gallery_metadata
    updated_count = 0
    for doc_id in request.doc_ids:
        if await update_gallery_metadata(doc_id, {"user_tags": request.tags}):
            updated_count += 1
    return {"status": "success", "updated_count": updated_count}

@router.patch("/gallery/{doc_id}/folder")
async def update_gallery_folder_endpoint(doc_id: str, request: UpdateGalleryFolderRequest, user: User = Depends(current_user)):
    """更新图库图片文件夹名称"""
    from app.rag.vectorstore.chroma_store import update_gallery_metadata
    success = await update_gallery_metadata(doc_id, {"folder_name": request.folder_name}, user_id=user.id)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在或无权限")
    return {"status": "success", "doc_id": doc_id, "folder_name": request.folder_name}


@router.get("/favorites")
async def list_favorites(limit: int = 100, user: User = Depends(current_user)):
    """获取当前用户的收藏图片列表"""
    try:
        from app.rag.vectorstore import chroma_store
        images = await chroma_store.get_favorite_images(limit=limit, user_id=user.id)
        return {"status": "success", "images": images}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/favorites")
async def add_favorite(req: FavoriteRequest, user: User = Depends(current_user)):
    """添加收藏图片（用户隔离）"""
    try:
        from app.rag.vectorstore import chroma_store
        # 添加 user_id 到 metadata
        metadata = {**req.metadata, "user_id": user.id}
        success = await chroma_store.upsert_favorite_image(req.img_id, metadata, user_id=user.id)
        if success:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=500, detail="收藏失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/favorites/{img_id}")
async def remove_favorite(img_id: str, user: User = Depends(current_user)):
    """取消收藏图片（用户隔离）"""
    try:
        from app.rag.vectorstore import chroma_store
        success = await chroma_store.delete_favorite_image(img_id, user_id=user.id)
        if success:
            return {"status": "success"}
        else:
            raise HTTPException(status_code=404, detail="收藏不存在或无权限")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
