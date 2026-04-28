import json
import os
import asyncio
import sys
from pathlib import Path
from typing import Any

from app.core.mcp_client import xhs_mcp


class XHSCLITools:
    """
    小红书 CLI 工具封装器
    通过 subprocess 调用 .agent/skills/xiaohongshu-skills/scripts/cli.py
    作为 MCP 不可用时的降级方案
    """

    CLI_TIMEOUT = 120.0
    BRIDGE_URL = "ws://localhost:9333"

    @classmethod
    def _candidate_cli_dirs(cls) -> list[Path]:
        """按优先级返回可能的 xiaohongshu-skills 目录。"""
        env_dir = os.getenv("XHS_CLI_DIR")
        backend_dir = Path(__file__).resolve().parents[2]
        repo_root = backend_dir.parent

        candidates = []
        if env_dir:
            candidates.append(Path(env_dir).expanduser())

        candidates.extend([
            repo_root / ".agent" / "skills" / "xiaohongshu-skills",
            repo_root / ".agent" / "skills" / "openclaw-for-magnes" / "xiaohongshu-skills",
        ])
        return candidates

    @classmethod
    def _resolve_cli_dir(cls) -> Path:
        """解析当前可用的 xiaohongshu-skills 目录。"""
        for candidate in cls._candidate_cli_dirs():
            if (candidate / "scripts" / "cli.py").exists():
                return candidate

        searched = "\n".join(str(path) for path in cls._candidate_cli_dirs())
        raise FileNotFoundError(
            "未找到 xiaohongshu-skills CLI。已检查以下路径:\n"
            f"{searched}\n"
            "请安装/同步 xiaohongshu-skills，或设置环境变量 XHS_CLI_DIR 指向其目录。"
        )

    @classmethod
    def _resolve_python_executable(cls) -> str:
        """解析用于执行 xiaohongshu-skills CLI 的 Python 解释器。"""
        env_python = os.getenv("XHS_CLI_PYTHON")
        if env_python:
            return env_python
        return sys.executable

    @classmethod
    async def _run_cli(cls, subcommand: str, *args, allow_exit_codes: set[int] | None = None) -> dict:
        """
        异步运行 CLI 子命令并解析 JSON 输出。
        """
        cli_dir = cls._resolve_cli_dir()
        python_executable = cls._resolve_python_executable()
        cmd = [python_executable, "scripts/cli.py", subcommand, *args]
        print(f"[XHS CLI Tool] 🚀 启动 CLI: {' '.join(cmd)} (cwd={cli_dir})")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(cli_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=cls.CLI_TIMEOUT
            )
            stderr_text = stderr.decode("utf-8", errors="ignore")

            if stderr:
                print(f"[XHS CLI Tool] ℹ️ CLI stderr: {stderr_text[:500]}")

            out_text = stdout.decode("utf-8", errors="ignore")
            print(f"[XHS CLI Tool] ℹ️ CLI returncode={proc.returncode}, stdout_len={len(out_text)}, stderr_len={len(stderr)}")
            print(f"[XHS CLI Tool] ℹ️ stdout 原始内容前 800 字符:\n{out_text[:800]}")

            allowed_codes = allow_exit_codes or {0}
            if proc.returncode not in allowed_codes:
                err_text = out_text or stderr_text
                print(f"[XHS CLI Tool] ❌ CLI 退出码 {proc.returncode}: {err_text[:500]}")
                raise RuntimeError(f"CLI 退出码 {proc.returncode}: {err_text[:200]}")

            output = out_text.strip()
            if not output:
                raise ValueError("CLI 无输出")

            data = json.loads(output)
            if isinstance(data, dict):
                data["_meta"] = {
                    "returncode": proc.returncode,
                    "stderr": stderr_text[:2000],
                }
            print(f"[XHS CLI Tool] ✅ CLI 成功返回: {subcommand}")
            return data

        except asyncio.TimeoutError:
            print(f"[XHS CLI Tool] ❌ CLI 超时 ({cls.CLI_TIMEOUT}s)")
            raise RuntimeError(f"CLI 执行超时 ({cls.CLI_TIMEOUT}s)")

    @classmethod
    async def check_login(cls) -> dict:
        """执行 check-login，并保留退出码用于上层判断。"""
        return await cls._run_cli("check-login", allow_exit_codes={0, 1})

    @classmethod
    async def check_extension_connection(cls) -> dict[str, Any]:
        """检查 bridge server 与浏览器扩展是否已连接。"""
        import websockets

        try:
            async with websockets.connect(cls.BRIDGE_URL, open_timeout=3, close_timeout=3) as ws:
                await ws.send(json.dumps({"role": "cli", "method": "ping_server"}, ensure_ascii=False))
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
        except Exception as e:
            return {
                "ok": False,
                "code": "extension_bridge_unreachable",
                "title": "未连接到 XHS Bridge 扩展",
                "message": "Magnes 当前无法连接到小红书浏览器桥接服务。",
                "detail": str(e),
                "instructions": [
                    "打开 Google Chrome，并保持浏览器处于运行状态。",
                    "访问 chrome://extensions/，确认已加载并启用 XHS Bridge 扩展。",
                    "如果刚启用扩展，请刷新小红书页面后重试。",
                ],
            }

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return {
                "ok": False,
                "code": "extension_bridge_invalid_response",
                "title": "XHS Bridge 返回异常",
                "message": "浏览器桥接服务已响应，但返回内容无法识别。",
                "detail": str(raw)[:500],
                "instructions": [
                    "重新打开 Chrome，并确认 XHS Bridge 扩展仍处于启用状态。",
                    "如果问题持续存在，关闭现有小红书页面后重新打开再试。",
                ],
            }

        bridge_result = payload.get("result") or {}
        if bridge_result.get("extension_connected"):
            return {"ok": True}

        return {
            "ok": False,
            "code": "extension_not_connected",
            "title": "未检测到 XHS Bridge 扩展连接",
            "message": "Bridge server 已启动，但还没有收到浏览器扩展连接。",
            "detail": "",
            "instructions": [
                "打开 chrome://extensions/，确认 XHS Bridge 扩展已启用。",
                "确认加载的目录是项目内的 .agent/skills/xiaohongshu-skills/extension。",
                "至少打开一个 Chrome 窗口，并刷新已打开的小红书页面后重试。",
            ],
        }

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
        normalized_feed_id = (feed_id or "").split("#", 1)[0].strip()
        if normalized_feed_id != feed_id:
            print(f"[XHS CLI Tool] 🧹 清洗 feed_id: {feed_id} -> {normalized_feed_id}")
        data = await cls._run_cli(
            "get-feed-detail", "--feed-id", normalized_feed_id, "--xsec-token", xsec_token
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

    @staticmethod
    async def precheck_xhs_environment():
        """按既定顺序检查登录状态与扩展连接。"""
        print("[XHS MCP Tool] 🩺 执行小红书环境预检: check-login -> extension")

        try:
            login_result = await XHSCLITools.check_login()
        except Exception as e:
            err_str = str(e) or type(e).__name__
            print(f"[XHS MCP Tool] ❌ check-login 失败: {err_str}")
            return {
                "ok": False,
                "code": "check_login_failed",
                "title": "小红书登录检查失败",
                "message": "无法完成小红书登录检查，请先确认 Chrome 与扩展环境已就绪。",
                "detail": err_str,
                "instructions": [
                    "打开 Google Chrome，并确保浏览器没有被系统拦截或关闭。",
                    "访问 chrome://extensions/，确认 XHS Bridge 扩展已启用。",
                    "确认你已经打开过小红书网页，然后再重试。",
                ],
            }

        login_meta = login_result.get("_meta") or {}
        if login_meta.get("returncode") == 1 or not login_result.get("logged_in"):
            print("[XHS MCP Tool] ⚠️ check-login 返回未登录")
            return {
                "ok": False,
                "code": "login_required",
                "title": "小红书尚未登录",
                "message": "浏览器环境已就绪，但当前账号未登录，搜索前需要先完成登录。",
                "detail": login_result.get("hint") or login_result.get("message") or "",
                "instructions": [
                    "使用手机小红书 App 扫描下方二维码完成登录。",
                    "如果二维码失效，重新发起一次搜索即可刷新二维码。",
                    "登录完成后，保持该 Chrome 会话不关闭，再回到 Magnes 重试。",
                ],
                "qrcode_image_url": login_result.get("qrcode_image_url"),
                "qrcode_path": login_result.get("qrcode_path"),
                "qr_login_url": login_result.get("qr_login_url"),
            }

        extension_result = await XHSCLITools.check_extension_connection()
        if not extension_result.get("ok"):
            print(f"[XHS MCP Tool] ❌ 扩展连接预检失败: {extension_result.get('code')}")
            return extension_result

        print("[XHS MCP Tool] ✅ 小红书环境预检通过")
        return {"ok": True}

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
