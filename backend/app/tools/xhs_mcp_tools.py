from app.core.mcp_client import xhs_mcp
import json
import traceback
import httpx

class XHSMCPTools:
    """
    小红书 MCP 工具封装器
    对接运行在 Docker 中的 xiaohongshu-mcp SSE 服务器
    """
    
    @staticmethod
    async def search_feeds(keyword: str):
        """
        搜索小红书笔记 (优先使用更稳定的 REST API)
        :param keyword: 关键词
        """
        import httpx
        from app.core.mcp_client import xhs_mcp
        
        # 尝试使用 REST API，它比 SSE 长连接更可靠
        url = "http://localhost:18060/api/v1/feeds/search"
        payload = {"keyword": keyword, "sort": "general"}
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                print(f"[XHS MCP Tool] 🚀 发起 REST 搜索: {keyword}")
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                
                # 兼容性检查：有些环境下 data=["data"] 可能不存在或为 None
                content_data = data.get("data")
                if data.get("success") and content_data:
                    feeds = content_data.get("feeds") or []
                    # 映射为 rag_routes 期望的简易格式
                    results = []
                    for f in feeds:
                        if not f: continue
                        card = f.get("noteCard") or f.get("note_card") or {}
                        interact = card.get("interactInfo") or card.get("interact_info") or {}
                        cover = card.get("cover") or {}
                        cover_url = cover.get("url") or cover.get("urlDefault") or cover.get("urlPre") or card.get("image") or ""
                        
                        # 转换 count 为整数
                        def to_int(v):
                            try: return int(v) if v else 0
                            except: return 0

                        results.append({
                            "id": f.get("id") or f.get("noteId"),
                            "xsec_token": f.get("xsecToken") or f.get("xsec_token"),
                            "title": card.get("displayTitle") or card.get("title"),
                            "cover_url": cover_url,
                            "desc": card.get("desc") or "",
                            "likes": to_int(interact.get("likedCount") or interact.get("liked_count")),
                            "collected_count": to_int(interact.get("collectedCount") or interact.get("collected_count")),
                            "comment_count": to_int(interact.get("commentCount") or interact.get("comment_count"))
                        })
                    return results
                
                # 如果 REST API 失败，降级回 MCP 工具
                msg = data.get('message') or "Unknown REST error"
                print(f"[XHS MCP Tool] ⚠️ REST 搜索未成功: {msg}, 尝试 MCP Fallback...")
                result = await xhs_mcp.call_tool("search_feeds", {"keyword": keyword})
                return result
                
        except Exception as e:
            err_str = str(e) or type(e).__name__
            print(f"[XHS MCP Tool] ⚠️ REST 搜索异常 ({err_str})，尝试 MCP Fallback...")
            try:
                result = await xhs_mcp.call_tool("search_feeds", {"keyword": keyword})
                return result
            except Exception as e2:
                err2_str = str(e2) or type(e2).__name__
                print(f"[XHS MCP Tool] ❌ MCP Fallback 也失败: {err2_str}")
                return {"error": f"搜索服务当前不可用。详情: REST({err_str}) | MCP({err2_str})。请检查小红书登录状态。"}

    @staticmethod
    async def get_feed_detail(feed_id: str, xsec_token: str, load_all_comments: bool = False, limit: int = 10):
        """
        获取笔记详情 (通过 REST API)
        """
        url = "http://localhost:18060/api/v1/feeds/detail"
        # 经过测试，该接口需要 application/x-www-form-urlencoded
        payload = {
            "feed_id": feed_id,
            "xsec_token": xsec_token
        }
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                print(f"[XHS MCP Tool] 🚀 发起 REST 详情获取: {feed_id}")
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                result = resp.json()
                
                # 规范化返回：REST 接口将数据包装在 "data" 键下
                if "data" in result and result["data"]:
                    print(f"[XHS MCP Tool] ✅ 获取详情成功，返回字段: {list(result['data'].keys())}")
                    return result["data"]
                return result
        except Exception as e:
            print(f"[XHS MCP Tool] ❌ 获取详情失败 ({feed_id}): {e}")
            if hasattr(e, "response") and e.response:
                print(f"  Response Body: {e.response.text}")
            return {"error": str(e)}

    @staticmethod
    async def get_note_detail(short_url: str):
        """
        获取笔记详情 (降级方案，通过 URL 获取)
        :param short_url: 笔记短链接或 ID
        """
        args = {"url": short_url}
        try:
            result = await xhs_mcp.call_tool("get_note_detail", args)
            return result
        except Exception as e:
            print(f"[XHS MCP Tool] 获取详情失败: {e}")
            return {"error": str(e)}

    @staticmethod
    async def publish_note(title: str, content: str, image_urls: list):
        """
        发布图文笔记 (注意：此操作需用户在前端二次确认)
        :param title: 标题
        :param content: 正文
        :param image_urls: 图片链接列表
        """
        args = {
            "title": title,
            "desc": content,
            "type": "image",
            "image_paths": image_urls # MCP 内部会自动下载 URL 或处理路径
        }
        try:
            result = await xhs_mcp.call_tool("publish_note", args)
            return result
        except Exception as e:
            print(f"[XHS MCP Tool] 发布失败: {e}")
            return {"error": str(e)}

    @staticmethod
    async def get_self_info():
        """获取当前登录用户信息"""
        try:
            result = await xhs_mcp.call_tool("get_self_info", {})
            return result
        except Exception as e:
            print(f"[XHS MCP Tool] 获取用户信息失败: {e}")
            return {"error": str(e)}
