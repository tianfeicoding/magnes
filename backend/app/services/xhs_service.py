import asyncio
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.tools.xhs_mcp_tools import XHSMCPTools
from app.rag.image_service import image_service
from app.rag.models.note_document import NoteDocument
from app.rag.vectorstore.chroma_store import upsert_document
from app.rag.retrieval.bm25_retriever import get_bm25_index
from app.services.xhs_progress import publish_xhs_progress


def _build_xhs_search_fallbacks(prompt: str) -> list[str]:
    """为小红书搜索构造通用降级关键词，不猜测用户要搜的主题。"""
    raw = str(prompt or "").strip()
    if not raw:
        return []

    candidates = [raw]
    no_space = re.sub(r"\s+", "", raw)
    if no_space != raw:
        candidates.append(no_space)

    cleaned = re.sub(
        r"(帮我|请|麻烦|搜索小红书|小红书搜索|搜索|查找|找一下|找找|"
        r"整理\s*\d+\s*个\w*|总结\s*\d+\s*个\w*|每页放\s*\d+\s*个\w*|"
        r"用我选中的灵感笔记|用选中的灵感笔记|生成小红书信息图|生成信息图)",
        " ",
        raw,
    )
    cleaned = re.sub(r"[，。！？、,.!?；;：:]+", " ", cleaned)
    cleaned = re.sub(r"\s+", "", cleaned).strip()
    cleaned = re.sub(r"(活动){2,}", "活动", cleaned)
    if cleaned and cleaned not in {raw, no_space}:
        candidates.append(cleaned)

    seen = set()
    result = []
    for candidate in candidates:
        normalized = candidate.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def _safe_xhs_count(value: Any) -> int:
    """Parse XHS count strings like '1.6万', '2千', or '赞' into integers."""
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text or text in {"赞", "点赞", "-", "--"}:
        return 0

    text = text.replace(",", "").replace(" ", "")
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return 0

    number = float(match.group(1))
    if "万" in text or "w" in text.lower():
        number *= 10000
    elif "千" in text or "k" in text.lower():
        number *= 1000
    return int(number)


async def search_xhs_livesearch(
    prompt: str,
    limit: int = 10,
    user_id: str = None,
    detail_limit: int = 10,
    detail_retries: int = 2,
) -> Dict[str, Any]:
    """
    通用小红书实时搜索服务：通过 MCP 搜索、抓取详情并同步到灵感库。
    """
    print(f"\n[XHS Service] 🔎 执行实时搜索: prompt='{prompt}', limit={limit}, detail_limit={detail_limit}, detail_retries={detail_retries}")
    print(f"[XHS Service] 👤 user_id={user_id}")
    
    try:
        precheck = await XHSMCPTools.precheck_xhs_environment()
        print(f"[XHS Service] 🩺 预检结果: ok={precheck.get('ok')}, code={precheck.get('code')}")
        if not precheck.get("ok"):
            print(f"[XHS Service] ⚠️ 环境预检失败: {precheck.get('code')}")
            return {
                "status": "precheck_failed",
                "message": precheck.get("message") or "小红书环境预检失败",
                "precheck": precheck,
            }

        # 1. 调用 MCP 搜索工具。空结果时自动尝试更短关键词。
        notes = []
        res = None
        used_keyword = prompt
        last_error_msg = ""
        for keyword in _build_xhs_search_fallbacks(prompt):
            print(f"[XHS Service] 🚀 开始调用 XHSMCPTools.search_feeds, keyword='{keyword}'")
            res = await XHSMCPTools.search_feeds(keyword)
            print(f"[XHS Service] 📥 search_feeds 返回类型: {type(res).__name__}, keyword='{keyword}'")

            if isinstance(res, dict) and "error" in res:
                last_error_msg = res.get("error") or "搜索服务当前不可用"
                break

            if isinstance(res, dict):
                notes = res.get("notes") or res.get("items") or []
            elif isinstance(res, list):
                notes = res
            else:
                notes = []

            if notes:
                used_keyword = keyword
                print(f"[XHS Service] ✅ 搜索命中 {len(notes)} 条，used_keyword='{used_keyword}'")
                break

            print(f"[XHS Service] ⚠️ 搜索为空，准备尝试下一个关键词: '{keyword}'")

        if last_error_msg:
            return {"status": "error", "message": last_error_msg}

        if not notes:
            return {
                "status": "success",
                "count": 0,
                "message": "未找到相关笔记",
                "results": [],
                "search_keyword": used_keyword,
            }

        # 3. 转化为本地 NoteDocument 并入库
        # 批量获取前 10 条结果的详情以补全正文（带重试机制）
        async def enrich_note(note_data):
            note_id = note_data.get("id") or note_data.get("note_id")
            xsec_token = note_data.get("xsec_token")
            if note_id and xsec_token:
                for attempt in range(max(1, detail_retries)):
                    try:
                        detail = await XHSMCPTools.get_feed_detail(note_id, xsec_token, load_all_comments=False, limit=1)

                        # 检查是否返回错误
                        if "error" in detail:
                            error_msg = detail.get("error", "")
                            error_code = detail.get("error_code") or "detail_error"
                            if "笔记不可访问" in str(error_msg) or "Page Isn't Available" in str(error_msg):
                                print(f"[XHS Service] ⚠️ 笔记已删除或不可访问 ({note_id})，跳过详情获取")
                                note_data["_detail_failed"] = "note_unavailable"
                                break  # 不需要重试，笔记本身问题
                            if error_code in {"detail_timeout", "verification_required", "no_detail_map"}:
                                print(f"[XHS Service] ⚠️ 详情抓取跳过 ({note_id}): {error_code} - {error_msg}")
                                note_data["_detail_failed"] = error_code
                                note_data["_detail_error"] = str(error_msg)[:500]
                                break
                            if attempt < max(1, detail_retries) - 1:
                                print(f"[XHS Service] ⚠️ 详情获取失败，1秒后重试: {note_id}")
                                await asyncio.sleep(1)
                                continue
                            else:
                                note_data["_detail_failed"] = error_code or "api_error"
                                note_data["_detail_error"] = str(error_msg)[:500]
                                break

                        note_card = detail.get("note") or detail.get("note_card") or {}
                        if not note_card and "data" in detail:
                            note_card = detail["data"].get("note") or detail["data"].get("note_card") or detail["data"]

                        if note_card and isinstance(note_card, dict):
                            note_data["desc"] = note_card.get("desc") or note_card.get("description") or note_data.get("desc")
                            note_data["title"] = note_card.get("title") or note_data.get("title")
                            interact = note_card.get("interactInfo") or note_card.get("interact_info") or {}
                            if interact:
                                note_data["likes"] = interact.get("likedCount") or interact.get("liked_count") or note_data.get("likes")
                                note_data["collected_count"] = interact.get("collectedCount") or interact.get("collected_count") or note_data.get("collected_count")
                                note_data["comment_count"] = interact.get("commentCount") or interact.get("comment_count") or note_data.get("comment_count")

                            img_list = note_card.get("imageList") or note_card.get("image_list") or []
                            all_urls = [img.get('urlDefault') or img.get('url') or img.get('url_default') for img in img_list if img]
                            if all_urls:
                                note_data["all_images"] = all_urls
                            note_data["_detail_fetched"] = True
                            break  # 成功获取，跳出重试循环
                        else:
                            print(f"[XHS Service] ⚠️ 详情返回空数据: {note_id}")
                            note_data["_detail_failed"] = "no_detail_map"
                            break
                    except Exception as e:
                        err_str = str(e)
                        if attempt < max(1, detail_retries) - 1 and ("timeout" in err_str.lower() or "connection" in err_str.lower()):
                            print(f"[XHS Service] ⚠️ 详情获取超时/连接错误，1秒后重试: {note_id}")
                            await asyncio.sleep(1)
                            continue
                        else:
                            print(f"[XHS Service] ⚠️ 深度抓取失败 ({note_id}): {e}")
                            note_data["_detail_failed"] = "exception"
                            break
            return note_data

        processed_docs = []
        fetched_count = 0
        failed_count = 0

        async def process_note(note):
            note_id = note.get("id") or note.get("note_id")
            title = note.get("title") or note.get("display_title") or note.get("displayTitle") or ""
            cover_obj = note.get("cover")
            cover = (
                note.get("cover_url")
                or note.get("image")
                or (cover_obj.get("urlDefault") if isinstance(cover_obj, dict) else None)
                or (cover_obj.get("url") if isinstance(cover_obj, dict) else None)
                or ""
            )

            if not note_id or not title or not cover:
                print(
                    "[XHS Service] ⚠️ 跳过入库，基础字段缺失: "
                    f"note_id={bool(note_id)}, title={bool(title)}, cover={bool(cover)}"
                )
                return None

            try:
                url = note.get("url") or f"https://www.xiaohongshu.com/explore/{note_id}"
                local_cover = await image_service.download_and_save(cover, "xhs")

                doc = NoteDocument(
                    id=f"xhs_{note_id}",
                    url=url,
                    title=title,
                    content=note.get("desc") or note.get("description") or "",
                    image_url=local_cover or cover,
                    all_images=note.get("all_images") or [],
                    ocr_text="",
                    visual_description="",
                    style_tags=[],
                    likes=_safe_xhs_count(note.get("likes")),
                    collected_count=_safe_xhs_count(note.get("collected_count")),
                    comment_count=_safe_xhs_count(note.get("comment_count")),
                    content_type="note",
                    created_at=datetime.utcnow()
                )

                if note.get("xsec_token"):
                    doc.style_tags.append(f"xsec_token:{note.get('xsec_token')}")

                await upsert_document(doc, user_id=user_id)
                doc_payload = {
                    "id": doc.id,
                    "title": doc.title,
                    "content": doc.content,
                    "image_url": doc.image_url
                }
                publish_xhs_progress({
                    "type": "xhs_document_added",
                    "document": doc_payload,
                    "refresh_rag": True,
                })
                get_bm25_index().mark_dirty()
                print(f"[XHS Service] ✅ 笔记已入库并推送前端: {doc.title}")
                return doc_payload
            except Exception as e:
                print(f"[XHS Service] ⚠️ 单条笔记入库失败 ({note_id}): {e}")
                return None

        # 搜索列表已包含标题和封面，先把基础结果入库，不能被详情页风控/卡住阻塞。
        base_notes = notes[:min(len(notes), limit)]
        for note in base_notes:
            doc_payload = await process_note(note)
            if doc_payload:
                processed_docs.append(doc_payload)

            if len(processed_docs) >= limit:
                break

        # 详情抓取只作为可选增强，默认不阻塞搜索入库链路。
        if os.getenv("XHS_ENABLE_DETAIL_ENRICH", "0") == "1" and detail_limit > 0:
            detail_notes = notes[:min(len(notes), detail_limit)]
            for note in detail_notes:
                enriched_note = await enrich_note(note)
                if enriched_note.get("_detail_fetched"):
                    fetched_count += 1
                    await process_note(enriched_note)
                elif enriched_note.get("_detail_failed"):
                    failed_count += 1

        if fetched_count or failed_count:
            print(f"[XHS Service] 📊 详情抓取统计: 成功 {fetched_count}, 失败 {failed_count}")

        # 4. 生成 AI 总结 (供 Planner 或 API 直接展现)
        summary = ""
        if processed_docs:
            try:
                from llama_index.core.llms import ChatMessage
                from app.rag.config import get_llm
                llm = get_llm()
                titles_str = "\n".join([f"- {d['title']}" for d in processed_docs[:8]])
                sys_prompt = "你是一个专业的小红书内容分析师。请根据提供的搜索结果标题，简单总结这些内容的整体趋势、核心卖点或风格特点。要求：语言干练，有启发性，字数控制在 100 字以内。"
                user_prompt = f"关键词: {used_keyword}\n\n搜索结果标题:\n{titles_str}"
                messages = [ChatMessage(role="system", content=sys_prompt), ChatMessage(role="user", content=user_prompt)]
                ai_res = await llm.achat(messages)
                summary = str(ai_res.message.content)
            except Exception as e:
                print(f"[XHS Service] ⚠️ 总结生成失败: {e}")
                summary = f"已在小红书为您找到 {len(processed_docs)} 条关于“{used_keyword}”的相关笔记，已同步至下方灵感库。"

        return {
            "status": "success",
            "count": len(processed_docs),
            "results": processed_docs,
            "summary": summary,
            "search_keyword": used_keyword,
        }

    except Exception as e:
        print(f"[XHS Service] ❌ 异常: {e}")
        return {"status": "error", "message": str(e)}
