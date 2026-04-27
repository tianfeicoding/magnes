from app.core.mcp_client import xhs_mcp
import json
import os
import asyncio
import traceback
import httpx


class XHSCLITools:
    """
    小红书 CLI 工具封装器
    通过 subprocess 调用 .agent/skills/xiaohongshu-skills/scripts/cli.py
    作为 MCP 不可用时的降级方案
    """

    CLI_DIR = "/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/xiaohongshu-skills"
    CLI_TIMEOUT = 120.0

    @classmethod
    async def _run_cli(cls, subcommand: str, *args) -> dict:
        """
        异步运行 CLI 子命令并解析 JSON 输出。
        """
        cmd = ["uv", "run", "python", "scripts/cli.py", subcommand, *args]
        print(f"[XHS CLI Tool] 🚀 启动 CLI: {' '.join(cmd)} (cwd={cls.CLI_DIR})")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cls.CLI_DIR,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=cls.CLI_TIMEOUT
            )

            if stderr:
                print(f"[XHS CLI Tool] ℹ️ CLI stderr: {stderr.decode('utf-8', errors='ignore')[:500]}")

            out_text = stdout.decode("utf-8", errors="ignore")
            print(f"[XHS CLI Tool] ℹ️ CLI returncode={proc.returncode}, stdout_len={len(out_text)}, stderr_len={len(stderr)}")
            print(f"[XHS CLI Tool] ℹ️ stdout 原始内容前 800 字符:\n{out_text[:800]}")

            if proc.returncode != 0:
                err_text = out_text or stderr.decode("utf-8", errors="ignore")
                print(f"[XHS CLI Tool] ❌ CLI 退出码 {proc.returncode}: {err_text[:500]}")
                raise RuntimeError(f"CLI 退出码 {proc.returncode}: {err_text[:200]}")

            output = out_text.strip()
            if not output:
                raise ValueError("CLI 无输出")

            data = json.loads(output)
            print(f"[XHS CLI Tool] ✅ CLI 成功返回: {subcommand}")
            return data

        except asyncio.TimeoutError:
            print(f"[XHS CLI Tool] ❌ CLI 超时 ({cls.CLI_TIMEOUT}s)")
            raise RuntimeError(f"CLI 执行超时 ({cls.CLI_TIMEOUT}s)")

    @classmethod
    def _convert_cli_feed(cls, feed: dict) -> dict:
        """
        将 CLI 输出的 feed 格式转换为后端统一格式。
        CLI 格式: {id, xsecToken, displayTitle, cover, interactInfo: {likedCount, ...}}
        """
        interact = feed.get("interactInfo") or {}

        def to_int(v):
            try:
                return int(v) if v else 0
            except Exception:
                return 0

        return {
            "id": feed.get("id"),
            "xsec_token": feed.get("xsecToken"),
            "title": feed.get("displayTitle") or feed.get("title"),
            "cover_url": feed.get("cover") or "",
            "desc": feed.get("desc") or "",
            "likes": to_int(interact.get("likedCount")),
            "collected_count": to_int(interact.get("collectedCount")),
            "comment_count": to_int(interact.get("commentCount")),
        }

    @classmethod
    async def search_feeds(cls, keyword: str):
        """
        通过 CLI 搜索小红书笔记。
        """
        data = await cls._run_cli("search-feeds", "--keyword", keyword)
        feeds = data.get("feeds") or []
        results = [cls._convert_cli_feed(f) for f in feeds if f]
        return results

    @classmethod
    async def get_feed_detail(cls, feed_id: str, xsec_token: str):
        """
        通过 CLI 获取笔记详情。
        """
        data = await cls._run_cli(
            "get-feed-detail", "--feed-id", feed_id, "--xsec-token", xsec_token
        )
        return data


class XHSMCPTools:
    """
    小红书 MCP 工具封装器
    对接运行在 Docker 中的 xiaohongshu-mcp SSE 服务器
    """

    @staticmethod
    async def search_feeds(keyword: str):
        """
        搜索小红书笔记 (当前走 CLI 方案，MCP 部分已注释保留)
        :param keyword: 关键词
        """
        print(f"[XHS MCP Tool] 🚀 直接走 CLI 搜索: {keyword}")
        try:
            result = await XHSCLITools.search_feeds(keyword)
            return result
        except Exception as e:
            err_str = str(e) or type(e).__name__
            print(f"[XHS MCP Tool] ❌ CLI 搜索失败: {err_str}")
            return {"error": f"搜索服务当前不可用。详情: CLI({err_str})。请检查小红书登录状态或 Chrome 环境。"}

        # ====== MCP 方案（已暂停使用，保留代码供未来恢复）======
        # import httpx
        # from app.core.mcp_client import xhs_mcp
        # url = "http://localhost:18060/api/v1/feeds/search"
        # payload = {"keyword": keyword, "sort": "general"}
        # try:
        #     async with httpx.AsyncClient(timeout=120.0) as client:
        #         resp = await client.post(url, json=payload)
        #         resp.raise_for_status()
        #         data = resp.json()
        #         ...

    @staticmethod
    async def get_feed_detail(feed_id: str, xsec_token: str, load_all_comments: bool = False, limit: int = 10):
        """
        获取笔记详情 (当前走 CLI 方案，MCP 部分已注释保留)
        """
        print(f"[XHS MCP Tool] 🚀 直接走 CLI 详情获取: {feed_id}")
        try:
            result = await XHSCLITools.get_feed_detail(feed_id, xsec_token)
            return result
        except Exception as e:
            err_str = str(e) or type(e).__name__
            print(f"[XHS MCP Tool] ❌ CLI 详情获取失败 ({feed_id}): {err_str}")
            return {"error": f"详情获取失败: CLI({err_str})"}

        # ====== MCP 方案（已暂停使用，保留代码供未来恢复）======
        # url = "http://localhost:18060/api/v1/feeds/detail"
        # payload = {"feed_id": feed_id, "xsec_token": xsec_token}
        # try:
        #     async with httpx.AsyncClient(timeout=120.0) as client:
        #         resp = await client.post(url, json=payload)
        #         resp.raise_for_status()
        #         result = resp.json()
        #         if "data" in result and result["data"]:
        #             return result["data"]
        #         return result
        # except Exception as e:
        #     ...

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
