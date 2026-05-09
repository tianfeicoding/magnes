# backend/app/core/mcp_client.py
import asyncio
import json
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client
import httpx

class MCPClient:
    def __init__(self, mode="stdio", **kwargs):
        self.mode = mode
        self.kwargs = kwargs
        self.session = None

    async def call_tool(self, tool_name: str, arguments: dict):
        """调用指定工具"""
        if self.mode == "stdio":
            server_params = StdioServerParameters(
                command=self.kwargs.get("server_path", "npx"),
                args=self.kwargs.get("args", ["-y", "@modelcontextprotocol/server-lark"]),
                env=os.environ.copy()
            )
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    print(f"[MCP Client] 🚀 (Stdio) Calling tool: {tool_name}")
                    result = await session.call_tool(tool_name, arguments)
                    return result
        
        elif self.mode == "sse":
            url = self.kwargs.get("url", "http://localhost:18060/mcp")
            async with sse_client(url) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    print(f"[MCP Client] 🚀 (SSE) Calling tool: {tool_name}")
                    result = await session.call_tool(tool_name, arguments)
                    return result
        
        elif self.mode == "http":
            url = self.kwargs.get("url", "http://localhost:18060/mcp")
            async with httpx.AsyncClient(timeout=60.0) as client:
                print(f"[MCP Client] 🚀 (HTTP) Calling tool: {tool_name}")
                # Xiaohongshu-mcp supports direct JSON-RPC over HTTP
                payload = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {
                        "name": tool_name,
                        "arguments": arguments
                    }
                }
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                return resp.json().get("result")

# 默认实例（飞书）
lark_mcp = MCPClient(mode="stdio", server_path="npx", args=["-y", "@modelcontextprotocol/server-lark"])

# 小红书实例（Docker HTTP - REST API 模式更稳定）
xhs_mcp = MCPClient(mode="http", url="http://localhost:18060")
