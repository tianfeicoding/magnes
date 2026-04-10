# backend/app/api/mcp_routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from app.core.mcp_client import lark_mcp, xhs_mcp
from app.core.semantic_service import extract_semantic_content

router = APIRouter(
    prefix="/mcp",
    tags=["mcp"]
)

class MCPCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    server_type: str = "lark"  # 默认为飞书，可选 "xhs"

class SemanticRequest(BaseModel):
    text: str

@router.post("/call")
async def call_mcp_tool(request: MCPCallRequest):
    """转发请求至指定 MCP 服务器"""
    try:
        client = xhs_mcp if request.server_type == "xhs" else lark_mcp
        result = await client.call_tool(
            request.tool_name, 
            request.arguments
        )
        return {"status": "success", "result": result}
    except Exception as e:
        print(f"[MCP API] ❌ Error calling tool {request.tool_name} on {request.server_type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/semantic/extract")
async def semantic_extract(request: SemanticRequest):
    """提取文案语义"""
    try:
        items = await extract_semantic_content(request.text)
        return {"status": "success", "items": items}
    except Exception as e:
        print(f"[Semantic API] ❌ Error extracting content: {e}")
        raise HTTPException(status_code=500, detail=str(e))
