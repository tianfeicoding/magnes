"""
Dialogue Routes
对话式 AI 助手的 API 端点，支持 SSE 实时流式输出。
用于 Phase 1: Manus 对话模式

核心端点：
- POST /dialogue/run      → SSE 流式对话（Planner 意图解析 + 画布操作指令）
- GET  /dialogue/history  → 获取对话历史
- DELETE /dialogue/clear  → 清空对话历史
"""
# backend/app/api/dialogue_routes.py
import json
import asyncio
from typing import Optional, List, Any
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.planner import run_planner
from app.core.users import current_user
from app.models.user import User

router = APIRouter(
    prefix="/dialogue",
    tags=["dialogue"]
)

# ─── 请求/响应数据模型 ───────────────────────────────────────────────────────

class CanvasNode(BaseModel):
    id: str
    type: str
    prompt: Optional[str] = None

class CanvasContext(BaseModel):
    nodes: Optional[List[CanvasNode]] = []
    activeNodeId: Optional[str] = None

class DialogueMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: Any # 兼容多模态 list 或 str

class DialogueRequest(BaseModel):
    message: str
    conversationId: str = "default"
    history: Optional[List[DialogueMessage]] = []
    canvasContext: Optional[dict] = None
    activeSkill: Optional[str] = None
    skillSummary: Optional[str] = None
    extraContext: Optional[dict] = None  # 从前端透传的附加状态（如 selectedDocIds 等）
    # 对话框图片上传（镜像到画布）
    imageUrl: Optional[str] = None
    ratio: Optional[str] = None


# ─── SSE 事件生成器 ──────────────────────────────────────────────────────────

async def sse_event_generator(request: DialogueRequest):
    """
    将 Planner Agent 的输出包装成 SSE 事件流。
    每个事件格式：data: <json_string>\n\n
    """
    try:
        # 如果前端传来的是 base64 图片，先将其持久化为本地文件
        # 避免 base64 大型字符串被写入 LangGraph SQLite checkpoint，导致 "no active connection" 崩溃
        effective_image_url = request.imageUrl
        if request.imageUrl and request.imageUrl.startswith("data:image"):
            from app.core.storage_utils import save_base64_image
            local_path = await save_base64_image(request.imageUrl)
            if local_path:
                # 转换为可被前端访问的完整 URL
                effective_image_url = f"http://localhost:8088{local_path}"
                print(f"[Dialogue] 🖼️ base64 图片已持久化: {effective_image_url}")
            else:
                # 保存失败时，传空值避免 Planner 崩溃，但 mirror_image 仍用原始 base64
                print("[Dialogue] ⚠️ base64 图片保存失败，使用原始 base64（不传给 Planner）")
                effective_image_url = None

        # 注意：不再在这里直接 yield mirror_image，移交给 Planner 的极速路径处理，以确保动作与文字同步

        # 流式运行 Planner (接入 LangGraph thread_id)
        # 注意：传给 Planner 的是持久化后的本地 URL，而非 base64
        async for event in run_planner(
            message=request.message,
            conversation_id=request.conversationId,
            canvas_context=request.canvasContext,
            active_skill=request.activeSkill,
            skill_summary=request.skillSummary,
            active_image_url=effective_image_url,  # ✅ 已转换为本地 URL
            active_image_ratio=request.ratio,
            extra_context=request.extraContext,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)  # 防止事件积压
        
        # 发送结束信号
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        
    except Exception as e:
        error_event = {"type": "error", "message": f"对话服务异常: {str(e)}"}
        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"


# ─── API 端点 ─────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_dialogue(request: DialogueRequest):
    """
    POST /api/v1/dialogue/run
    
    接收用户对话消息，通过 Planner Agent 解析意图，
    以 SSE 流式推送思维链、操作指令和回复文字给前端。
    """
    print(f"\n[Dialogue SSE] 收到新请求: conv_id={request.conversationId}, msg_len={len(request.message if request.message else '')}")
    return StreamingResponse(
        sse_event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲，确保实时推送
            "Access-Control-Allow-Origin": "*"
        }
    )

@router.get("/history")
async def get_dialogue_history(conversationId: str):
    """
    GET /api/v1/dialogue/history?conversationId=...
    获取指定会话的历史记录。
    """
    try:
        from app.agents.planner import get_planner_history
        history = await get_planner_history(conversationId)
        return {"status": "success", "history": history}
    except Exception as e:
        print(f"[dialogue_routes] ❌ 获取历史失败: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "success", "history": []}

@router.delete("/clear")
async def clear_dialogue_history(conversationId: str):
    """
    DELETE /api/v1/dialogue/clear?conversationId=...
    清空指定会话的历史记录。
    """
    from app.agents.planner import clear_planner_history
    await clear_planner_history(conversationId)
    return {"status": "success"}

class ManualMessageRequest(BaseModel):
    conversationId: str
    role: str
    content: str
    imageUrl: Optional[str] = None

@router.post("/message")
async def record_manual_message(request: ManualMessageRequest):
    """
    POST /api/v1/dialogue/message
    手动存入一条对话消息到历史记录中。支持多模态（图片）。
    """
    try:
        from app.agents.planner import add_planner_history
        await add_planner_history(request.conversationId, request.content, request.role, request.imageUrl)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/sessions")
async def get_all_dialogue_sessions():
    """
    GET /api/v1/dialogue/sessions
    获取系统中所有已存在的会话记录。
    """
    from app.agents.planner import get_all_sessions
    sessions = await get_all_sessions()
    return {"status": "success", "sessions": sessions}
@router.delete("/sessions/{conversationId}")
async def delete_dialogue_session(conversationId: str):
    """
    DELETE /api/v1/dialogue/sessions/{id}
    物理删除指定的会话记录。
    """
    from app.agents.planner import delete_planner_session
    await delete_planner_session(conversationId)
    return {"status": "success"}
