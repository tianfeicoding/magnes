import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.tools.xhs_mcp_tools import XHSMCPTools
from app.rag.image_service import image_service
from app.rag.models.note_document import NoteDocument
from app.rag.vectorstore.chroma_store import upsert_document
from app.rag.retrieval.bm25_retriever import get_bm25_index

async def search_xhs_livesearch(prompt: str, limit: int = 10, user_id: str = None) -> Dict[str, Any]:
    """
    通用小红书实时搜索服务：通过 MCP 搜索、抓取详情并同步到灵感库。
    """
    print(f"\n[XHS Service] 🔎 执行实时搜索: prompt='{prompt}', limit={limit}")
    
    try:
        # 1. 调用 MCP 搜索工具
        res = await XHSMCPTools.search_feeds(prompt)
        
        if not res or (isinstance(res, dict) and "error" in res):
            error_msg = res.get("error") if isinstance(res, dict) else "搜索返回空结果"
            return {"status": "error", "message": error_msg}

        # 2. 解析搜索结果
        notes = []
        if isinstance(res, dict):
            notes = res.get("notes") or res.get("items") or []
        elif isinstance(res, list):
            notes = res

        if not notes:
            return {"status": "success", "count": 0, "message": "未找到相关笔记", "results": []}

        # 3. 转化为本地 NoteDocument 并入库
        # 批量获取前 10 条结果的详情以补全正文（带重试机制）
        async def enrich_note(note_data):
            note_id = note_data.get("id") or note_data.get("note_id")
            xsec_token = note_data.get("xsec_token")
            if note_id and xsec_token:
                # 最多重试 2 次
                for attempt in range(2):
                    try:
                        detail = await XHSMCPTools.get_feed_detail(note_id, xsec_token, load_all_comments=False, limit=1)

                        # 检查是否返回错误
                        if "error" in detail:
                            error_msg = detail.get("error", "")
                            if "笔记不可访问" in str(error_msg) or "Page Isn't Available" in str(error_msg):
                                print(f"[XHS Service] ⚠️ 笔记已删除或不可访问 ({note_id})，跳过详情获取")
                                note_data["_detail_failed"] = "note_unavailable"
                                break  # 不需要重试，笔记本身问题
                            if attempt == 0:
                                print(f"[XHS Service] ⚠️ 详情获取失败，1秒后重试: {note_id}")
                                await asyncio.sleep(1)
                                continue
                            else:
                                note_data["_detail_failed"] = "api_error"
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
                            note_data["_detail_failed"] = "empty_data"
                            break
                    except Exception as e:
                        err_str = str(e)
                        if attempt == 0 and ("timeout" in err_str.lower() or "connection" in err_str.lower()):
                            print(f"[XHS Service] ⚠️ 详情获取超时/连接错误，1秒后重试: {note_id}")
                            await asyncio.sleep(1)
                            continue
                        else:
                            print(f"[XHS Service] ⚠️ 深度抓取失败 ({note_id}): {e}")
                            note_data["_detail_failed"] = "exception"
                            break
            return note_data

        # 限制并发数为 3，避免触发风控
        semaphore = asyncio.Semaphore(3)

        async def enrich_with_limit(note_data):
            async with semaphore:
                return await enrich_note(note_data)

        enriched_tasks = [enrich_with_limit(note) for note in notes[:10]]
        if enriched_tasks:
            enriched_notes = await asyncio.gather(*enriched_tasks)
            for i, en_note in enumerate(enriched_notes):
                notes[i] = en_note

        # 统计抓取结果
        fetched_count = sum(1 for n in notes[:10] if n.get("_detail_fetched"))
        failed_count = 10 - fetched_count
        if failed_count > 0:
            print(f"[XHS Service] 📊 详情抓取统计: 成功 {fetched_count}/10, 失败 {failed_count}/10")

        processed_docs = []
        for note in notes:
            note_id = note.get("id") or note.get("note_id")
            title = note.get("title") or note.get("display_title") or ""
            cover = note.get("cover_url") or note.get("image") or ""
            
            if not note_id or not title or not cover: continue
                
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
                likes=int(note.get("likes") or 0),
                collected_count=int(note.get("collected_count") or 0),
                comment_count=int(note.get("comment_count") or 0),
                content_type="note",
                created_at=datetime.utcnow()
            )
            
            if len(processed_docs) >= limit: break
            
            if note.get("xsec_token"):
                doc.style_tags.append(f"xsec_token:{note.get('xsec_token')}")
            
            await upsert_document(doc, user_id=user_id)
            processed_docs.append({
                "id": doc.id,
                "title": doc.title,
                "content": doc.content,
                "image_url": doc.image_url
            })

        if processed_docs:
            get_bm25_index().mark_dirty()

        # 4. 生成 AI 总结 (供 Planner 或 API 直接展现)
        summary = ""
        if processed_docs:
            try:
                from llama_index.core.llms import ChatMessage
                from app.rag.config import get_llm
                llm = get_llm()
                titles_str = "\n".join([f"- {d['title']}" for d in processed_docs[:8]])
                sys_prompt = "你是一个专业的小红书内容分析师。请根据提供的搜索结果标题，简单总结这些内容的整体趋势、核心卖点或风格特点。要求：语言干练，有启发性，字数控制在 100 字以内。"
                user_prompt = f"关键词: {prompt}\n\n搜索结果标题:\n{titles_str}"
                messages = [ChatMessage(role="system", content=sys_prompt), ChatMessage(role="user", content=user_prompt)]
                ai_res = await llm.achat(messages)
                summary = str(ai_res.message.content)
            except Exception as e:
                print(f"[XHS Service] ⚠️ 总结生成失败: {e}")
                summary = f"已在小红书为您找到 {len(processed_docs)} 条关于“{prompt}”的相关笔记，已同步至下方灵感库。"

        return {
            "status": "success",
            "count": len(processed_docs),
            "results": processed_docs,
            "summary": summary
        }

    except Exception as e:
        print(f"[XHS Service] ❌ 异常: {e}")
        return {"status": "error", "message": str(e)}
