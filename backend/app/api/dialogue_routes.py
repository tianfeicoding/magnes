"""
Dialogue Routes
对话式 AI 助手的 API 端点，支持 SSE 实时流式输出。
用于自然语言对话模式

核心端点：
- POST /dialogue/run      → SSE 流式对话（Planner 意图解析 + 画布操作指令）
- GET  /dialogue/history  → 获取对话历史
- DELETE /dialogue/clear  → 清空对话历史
"""
# backend/app/api/dialogue_routes.py
import json
import asyncio
import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.planner import run_planner, make_user_thread_id
from app.core.users import current_user
from app.models.user import User
from app.core.database import get_db
from app.memory import service as memory_service
from app.memory.models import InstalledSkill, SkillRun, SkillFeedbackEvent, SkillPatchProposal

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


CORRECTION_KEYWORDS = [
    "不对", "错了", "不是", "应该", "改成", "下次", "以后", "不要", "别再",
    "没有按", "模板不对", "模版不对", "触发错", "召回错", "应该先", "应该用",
]


def _looks_like_skill_correction(message: str) -> bool:
    text = (message or "").strip()
    if len(text) < 2:
        return False
    return any(keyword in text for keyword in CORRECTION_KEYWORDS)


def _build_patch_change_from_feedback(message: str, run: SkillRun) -> Dict[str, Any]:
    text = (message or "").strip()
    if any(keyword in text for keyword in ["触发错", "召回错", "不要触发", "别再触发"]):
        patch_type = "negative_rule"
        section = "不应触发场景"
        content = f"当用户表达类似“{text}”的纠正时，后续应降低或禁止该场景下召回此技能。"
    elif any(keyword in text for keyword in ["应该先", "先搜索", "先用", "流程", "步骤"]):
        patch_type = "workflow_step"
        section = "工作流步骤"
        content = f"后续执行此技能时应遵守用户纠正：{text}"
    else:
        patch_type = "behavior_rule"
        section = "执行规则"
        content = f"后续执行此技能时应优先遵守用户纠正：{text}"

    return {
        "patch_type": patch_type,
        "change": {
            "section": section,
            "operation": "add",
            "content": content,
            "source_message": text,
            "source_run_id": run.id,
        }
    }


# ─── SSE 事件生成器 ──────────────────────────────────────────────────────────

async def sse_event_generator(request: DialogueRequest, db: AsyncSession, user: User):
    """
    将 Planner Agent 的输出包装成 SSE 事件流。
    每个事件格式：data: <json_string>\n\n
    """
    try:
        project_id = (request.extraContext or {}).get("projectId") or (request.extraContext or {}).get("project_id")
        trace_id = (request.extraContext or {}).get("traceId") or (request.extraContext or {}).get("trace_id") or str(uuid.uuid4())
        planner_actions = []
        artifacts = []
        failure_reason = None
        current_skill_run = None
        patch_proposal_event = None

        async def start_skill_run(skill_id: Optional[str], trigger_source: str, *, recall_payload: Optional[dict] = None):
            if not skill_id:
                return None
            try:
                result = await db.execute(
                    select(InstalledSkill).where(
                        and_(InstalledSkill.user_id == user.id, InstalledSkill.skill_id == skill_id)
                    )
                )
                installed = result.scalar_one_or_none()
                run = SkillRun(
                    user_id=user.id,
                    skill_id=skill_id,
                    installed_skill_id=installed.id if installed else None,
                    skill_version=(installed.version if installed else None),
                    project_id=project_id,
                    conversation_id=request.conversationId,
                    trace_id=trace_id,
                    trigger_source=trigger_source,
                    input_message=request.message,
                    active_context={
                        "activeSkill": request.activeSkill,
                        "skillSummary": request.skillSummary,
                        "canvasContext": request.canvasContext,
                        "extraContext": request.extraContext,
                        "recall": recall_payload or {},
                    },
                    status="running",
                )
                db.add(run)
                await db.commit()
                await db.refresh(run)
                print(f"[SkillRun] ▶️ started id={run.id} skill={skill_id} trigger={trigger_source}", flush=True)
                return run
            except Exception as e:
                print(f"[SkillRun] ⚠️ 创建运行记录失败: {e}", flush=True)
                try:
                    await db.rollback()
                except Exception:
                    pass
                return None

        async def update_skill_run(run: Optional[SkillRun], **changes):
            if not run:
                return
            try:
                for key, value in changes.items():
                    setattr(run, key, value)
                await db.commit()
            except Exception as e:
                print(f"[SkillRun] ⚠️ 更新运行记录失败: {e}", flush=True)
                try:
                    await db.rollback()
                except Exception:
                    pass

        try:
            await memory_service.start_task_trace(
                db,
                user.id,
                user_goal=request.message,
                project_id=project_id,
                conversation_id=request.conversationId,
                trace_id=trace_id,
            )
        except Exception as e:
            print(f"[Dialogue TaskTrace] ⚠️ 创建任务轨迹失败: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

        async def record_event(event_type: str, *, role: Optional[str] = None, content: Optional[str] = None, payload: Optional[dict] = None, source: str = "dialogue_sse"):
            try:
                await memory_service.record_memory_event(
                    db,
                    user.id,
                    event_type,
                    role=role,
                    content=content,
                    payload=payload or {},
                    source=source,
                    project_id=project_id,
                    conversation_id=request.conversationId,
                    trace_id=trace_id,
                )
            except Exception as e:
                print(f"[Dialogue MemoryEvent] ⚠️ 事件记录失败: {e}")
                try:
                    await db.rollback()
                except Exception:
                    pass

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
        await record_event(
            "session_message",
            role="user",
            content=request.message,
            payload={
                "imageUrl": effective_image_url,
                "ratio": request.ratio,
                "activeSkill": request.activeSkill,
                "canvasContext": request.canvasContext,
            },
        )

        if _looks_like_skill_correction(request.message):
            try:
                recent_result = await db.execute(
                    select(SkillRun)
                    .where(
                        and_(
                            SkillRun.user_id == user.id,
                            SkillRun.conversation_id == request.conversationId,
                            SkillRun.status.in_(["success", "failed"]),
                        )
                    )
                    .order_by(desc(SkillRun.started_at))
                    .limit(1)
                )
                recent_run = recent_result.scalar_one_or_none()
                if recent_run:
                    patch_data = _build_patch_change_from_feedback(request.message, recent_run)
                    feedback = SkillFeedbackEvent(
                        user_id=user.id,
                        skill_id=recent_run.skill_id,
                        skill_run_id=recent_run.id,
                        event_type="explicit_negative_feedback",
                        user_message=request.message,
                        before_state=recent_run.final_output or {},
                        detected_issue=request.message[:500],
                    )
                    db.add(feedback)
                    await db.flush()

                    installed_result = await db.execute(
                        select(InstalledSkill).where(
                            and_(InstalledSkill.user_id == user.id, InstalledSkill.skill_id == recent_run.skill_id)
                        )
                    )
                    installed = installed_result.scalar_one_or_none()
                    proposal = SkillPatchProposal(
                        user_id=user.id,
                        skill_id=recent_run.skill_id,
                        installed_skill_id=installed.id if installed else recent_run.installed_skill_id,
                        base_version=(installed.version if installed else recent_run.skill_version),
                        issue_summary=f"用户纠正了技能执行方式：{request.message[:300]}",
                        patch_type=patch_data["patch_type"],
                        suggested_changes=[patch_data["change"]],
                        risk="medium",
                        status="pending",
                        created_from_run_id=recent_run.id,
                        feedback_event_id=feedback.id,
                    )
                    db.add(proposal)
                    await db.commit()
                    await db.refresh(proposal)
                    patch_proposal_event = {
                        "type": "skill_patch_proposal",
                        "proposal": proposal.to_dict(),
                        "message": "检测到你对技能结果进行了纠正，是否把这条规则更新到该技能？",
                    }
                    await record_event(
                        "skill_feedback",
                        content=request.message,
                        payload={"proposalId": proposal.id, "skillId": recent_run.skill_id},
                        source="skill_feedback_detector",
                    )
                    print(f"[SkillPatch] 🧩 proposal created id={proposal.id} skill={recent_run.skill_id}", flush=True)
            except Exception as e:
                print(f"[SkillPatch] ⚠️ 生成技能更新建议失败: {e}", flush=True)
                try:
                    await db.rollback()
                except Exception:
                    pass

        if request.activeSkill:
            current_skill_run = await start_skill_run(request.activeSkill, "manual_click")

        # 拉取用户记忆摘要并注入对话
        memory_summary = ""
        if user:
            memory_summary = await memory_service.build_memory_summary_for_injection(
                db=db, user_id=user.id
            )
            if memory_summary:
                print(f"[Dialogue] 🧠 Memory summary injected, length={len(memory_summary)}")

        skill_index = []
        try:
            result = await db.execute(
                select(InstalledSkill)
                .where(InstalledSkill.user_id == user.id, InstalledSkill.enabled == 1)
                .order_by(InstalledSkill.updated_at.desc())
                .limit(20)
            )
            for skill in result.scalars().all():
                manifest = skill.manifest_json or {}
                skill_index.append({
                    "skill_id": skill.skill_id,
                    "name": skill.name,
                    "description": skill.description,
                    "recall_keywords": manifest.get("recall_keywords") or [],
                    "recall_rules": manifest.get("recall_rules") or {},
                    "required_slots": manifest.get("required_slots") or [],
                    "risk_level": manifest.get("risk_level") or "medium",
                    "auto_run_policy": manifest.get("auto_run_policy") or "ask_if_missing",
                    "usage_summary": manifest.get("usage_summary") or [],
                    "triggers": manifest.get("triggers") or [],
                })
            if skill_index:
                print(f"[Dialogue] 🧩 Enabled skill index injected, count={len(skill_index)}")
        except Exception as e:
            print(f"[Dialogue] ⚠️ 加载技能索引失败: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

        planner_thread_id = make_user_thread_id(user.id, request.conversationId)

        # 流式运行 Planner (接入按用户隔离的 LangGraph thread_id)
        # 注意：传给 Planner 的是持久化后的本地 URL，而非 base64
        # 将 user_id 注入 extra_context，供下游 Agent（如 XHS 搜索入库）使用
        enriched_extra_context = {
            **(request.extraContext or {}),
            "user_id": user.id,
            "conversation_id": request.conversationId,
            "trace_id": trace_id,
            "skill_index": skill_index,
        }

        if patch_proposal_event:
            yield f"data: {json.dumps(patch_proposal_event, ensure_ascii=False)}\n\n"

        async for event in run_planner(
            message=request.message,
            conversation_id=planner_thread_id,
            canvas_context=request.canvasContext,
            active_skill=request.activeSkill,
            skill_summary=request.skillSummary,
            active_image_url=effective_image_url,  # ✅ 已转换为本地 URL
            active_image_ratio=request.ratio,
            extra_context=enriched_extra_context,
            memory_summary=memory_summary,
        ):
            if event.get("type") == "skill_recall":
                if not current_skill_run:
                    current_skill_run = await start_skill_run(
                        event.get("skillId"),
                        "auto_recall",
                        recall_payload=event,
                    )
                await record_event(
                    "skill_recall",
                    content=event.get("skillName") or event.get("skillId"),
                    payload=event,
                    source="skill_recall",
                )
            if event.get("type") == "reply":
                await record_event(
                    "session_message",
                    role="assistant",
                    content=event.get("content"),
                    payload={k: v for k, v in event.items() if k not in {"content"}},
                )
            elif event.get("type") == "action":
                action_name = event.get("action")
                if action_name and action_name not in planner_actions:
                    planner_actions.append(action_name)
                    if current_skill_run:
                        next_actions = list(current_skill_run.planner_actions or [])
                        next_actions.append(action_name)
                        await update_skill_run(current_skill_run, planner_actions=next_actions)
                await record_event(
                    "planner_action",
                    content=action_name,
                    payload=event,
                )
            elif event.get("type") == "results":
                artifacts.append({"type": "results", "count": len(event.get("results") or [])})
            elif event.get("type") == "error":
                failure_reason = event.get("message")
                await update_skill_run(
                    current_skill_run,
                    status="failed",
                    error_message=failure_reason,
                    ended_at=datetime.utcnow(),
                )
                await record_event(
                    "tool_result",
                    content=event.get("message"),
                    payload=event,
                    source="dialogue_error",
                )
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)  # 防止事件积压
        
        try:
            await memory_service.finish_task_trace(
                db,
                trace_id,
                user.id,
                outcome_status="error" if failure_reason else "success",
                planner_actions=planner_actions,
                artifacts=artifacts,
                failure_reason=failure_reason,
            )
            if current_skill_run and current_skill_run.status == "running":
                await update_skill_run(
                    current_skill_run,
                    status="failed" if failure_reason else "success",
                    error_message=failure_reason,
                    final_output={"artifacts": artifacts, "plannerActions": planner_actions},
                    ended_at=datetime.utcnow(),
                )
        except Exception as e:
            print(f"[Dialogue TaskTrace] ⚠️ 完成任务轨迹失败: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

        # 发送结束信号
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        
    except Exception as e:
        error_event = {"type": "error", "message": f"对话服务异常: {str(e)}"}
        yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"


# ─── API 端点 ─────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_dialogue(
    request: DialogueRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    POST /api/v1/dialogue/run

    接收用户对话消息，通过 Planner Agent 解析意图，
    以 SSE 流式推送思维链、操作指令和回复文字给前端。
    """
    print(f"\n[Dialogue SSE] 收到新请求: conv_id={request.conversationId}, msg_len={len(request.message if request.message else '')}")
    return StreamingResponse(
        sse_event_generator(request, db, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲，确保实时推送
            "Access-Control-Allow-Origin": "*"
        }
    )

@router.get("/history")
async def get_dialogue_history(
    conversationId: str,
    user: User = Depends(current_user)
):
    """
    GET /api/v1/dialogue/history?conversationId=...
    获取指定会话的历史记录。
    """
    try:
        from app.agents.planner import get_planner_history
        history = await get_planner_history(make_user_thread_id(user.id, conversationId))
        return {"status": "success", "history": history}
    except Exception as e:
        print(f"[dialogue_routes] ❌ 获取历史失败: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "success", "history": []}

@router.delete("/clear")
async def clear_dialogue_history(
    conversationId: str,
    user: User = Depends(current_user)
):
    """
    DELETE /api/v1/dialogue/clear?conversationId=...
    清空指定会话的历史记录。
    """
    from app.agents.planner import clear_planner_history
    await clear_planner_history(make_user_thread_id(user.id, conversationId))
    return {"status": "success"}

class ManualMessageRequest(BaseModel):
    conversationId: str
    role: str
    content: str
    imageUrl: Optional[str] = None

@router.post("/message")
async def record_manual_message(
    request: ManualMessageRequest,
    user: User = Depends(current_user)
):
    """
    POST /api/v1/dialogue/message
    手动存入一条对话消息到历史记录中。支持多模态（图片）。
    """
    try:
        from app.agents.planner import add_planner_history
        await add_planner_history(
            make_user_thread_id(user.id, request.conversationId),
            request.content,
            request.role,
            request.imageUrl
        )
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/sessions")
async def get_all_dialogue_sessions(user: User = Depends(current_user)):
    """
    GET /api/v1/dialogue/sessions
    获取系统中所有已存在的会话记录。
    """
    from app.agents.planner import get_all_sessions
    thread_prefix = make_user_thread_id(user.id, "")
    sessions = await get_all_sessions(thread_prefix=thread_prefix)
    return {"status": "success", "sessions": sessions}
@router.delete("/sessions/{conversationId}")
async def delete_dialogue_session(
    conversationId: str,
    user: User = Depends(current_user)
):
    """
    DELETE /api/v1/dialogue/sessions/{id}
    物理删除指定的会话记录。
    """
    from app.agents.planner import delete_planner_session
    await delete_planner_session(make_user_thread_id(user.id, conversationId))
    return {"status": "success"}
