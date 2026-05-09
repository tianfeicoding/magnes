from typing import Optional, List, Any, Dict
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.memory.models import UserMemory, MemoryEvent, MemoryAnalysisState, TaskTrace, SkillCandidate
from app.memory.schemas import MemoryCreateRequest, MemoryUpdateRequest


async def list_memories(
    db: AsyncSession,
    user_id: str,
    memory_type: Optional[str] = None
) -> List[UserMemory]:
    """获取用户的记忆列表"""
    query = select(UserMemory).where(UserMemory.user_id == user_id)
    if memory_type:
        query = query.where(UserMemory.memory_type == memory_type)
    query = query.order_by(UserMemory.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


async def upsert_memory(
    db: AsyncSession,
    user_id: str,
    req: MemoryCreateRequest
) -> UserMemory:
    """创建或更新记忆（按 user_id + memory_type + key 联合唯一）"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == req.memoryType,
                UserMemory.key == req.key,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = req.content
        if req.confidence is not None:
            existing.confidence = req.confidence
        if req.evidence is not None:
            existing.evidence = req.evidence
        if req.sourceConversationId is not None:
            existing.source_conversation_id = req.sourceConversationId
        return existing
    else:
        new_item = UserMemory(
            user_id=user_id,
            memory_type=req.memoryType,
            key=req.key,
            content=req.content,
            confidence=req.confidence,
            evidence=req.evidence,
            source_conversation_id=req.sourceConversationId,
        )
        db.add(new_item)
        return new_item


async def update_memory(
    db: AsyncSession,
    user_id: str,
    memory_id: str,
    req: MemoryUpdateRequest
) -> Optional[UserMemory]:
    """按 ID 更新记忆"""
    result = await db.execute(
        select(UserMemory).where(
            and_(UserMemory.id == memory_id, UserMemory.user_id == user_id)
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        return None
    if req.content is not None:
        item.content = req.content
    if req.confidence is not None:
        item.confidence = req.confidence
    if req.evidence is not None:
        item.evidence = req.evidence
    return item


async def delete_memory(
    db: AsyncSession,
    user_id: str,
    memory_id: str
) -> bool:
    """按 ID 删除记忆"""
    result = await db.execute(
        select(UserMemory).where(
            and_(UserMemory.id == memory_id, UserMemory.user_id == user_id)
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        return False
    await db.delete(item)
    return True


async def get_soul_md(
    db: AsyncSession,
    user_id: str
) -> Optional[UserMemory]:
    """获取用户的 Soul.md"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == "soul",
                UserMemory.key == "soul_md",
            )
        )
    )
    return result.scalar_one_or_none()


async def upsert_soul_md(
    db: AsyncSession,
    user_id: str,
    text: str
) -> UserMemory:
    """创建或更新 Soul.md"""
    item = await get_soul_md(db, user_id)
    if item:
        item.content = {"text": text}
        item.evidence = text[:200] if text else ""
        item.confidence = 1.0
    else:
        item = UserMemory(
            user_id=user_id,
            memory_type="soul",
            key="soul_md",
            content={"text": text},
            confidence=1.0,
            evidence=text[:200] if text else "",
        )
        db.add(item)
    return item


async def get_memory_md(
    db: AsyncSession,
    user_id: str
) -> Optional[UserMemory]:
    """获取用户的 MEMORY.md"""
    result = await db.execute(
        select(UserMemory).where(
            and_(
                UserMemory.user_id == user_id,
                UserMemory.memory_type == "memory",
                UserMemory.key == "memory_md",
            )
        )
    )
    return result.scalar_one_or_none()


async def upsert_memory_md(
    db: AsyncSession,
    user_id: str,
    text: str
) -> UserMemory:
    """创建或更新 MEMORY.md"""
    item = await get_memory_md(db, user_id)
    if item:
        item.content = {"text": text}
        item.evidence = text[:200] if text else ""
        item.confidence = 1.0
    else:
        item = UserMemory(
            user_id=user_id,
            memory_type="memory",
            key="memory_md",
            content={"text": text},
            confidence=1.0,
            evidence=text[:200] if text else "",
        )
        db.add(item)
    return item


async def build_memory_summary_for_injection(
    db: AsyncSession,
    user_id: str
) -> str:
    """组装成可直接拼接到 system prompt 的文本块"""
    parts = []

    # 1. Soul.md 最高优先级
    soul = await get_soul_md(db, user_id)
    if soul and soul.content.get("text"):
        parts.append(f"[用户设定 - Soul.md]\n{soul.content['text'].strip()}")

    # 2. MEMORY.md 次之
    memory_md = await get_memory_md(db, user_id)
    if memory_md and memory_md.content.get("text"):
        parts.append(f"[记忆索引 - MEMORY.md]\n{memory_md.content['text'].strip()}")

    # 3. preference 类型记忆
    prefs = await list_memories(db, user_id, memory_type="preference")
    strong_prefs = [p for p in prefs if p.confidence > 0.5]
    if strong_prefs:
        parts.append("[用户偏好]")
        for p in strong_prefs[:8]:
            val = p.content.get("label") or p.content.get("value") or str(p.content)
            parts.append(f"- {p.key}: {val}")

    # 4. style 类型记忆
    styles = await list_memories(db, user_id, memory_type="style")
    strong_styles = [p for p in styles if p.confidence > 0.5]
    if strong_styles:
        parts.append("[设计风格偏好]")
        for p in strong_styles[:6]:
            val = p.content.get("label") or p.content.get("value") or p.content.get("details") or str(p.content)
            parts.append(f"- {p.key}: {val}")

    # 5. workflow 类型记忆
    workflows = await list_memories(db, user_id, memory_type="workflow")
    strong_workflows = [p for p in workflows if p.confidence > 0.5]
    if strong_workflows:
        parts.append("[工作流习惯]")
        for p in strong_workflows[:5]:
            val = p.content.get("pattern") or p.content.get("value") or p.content.get("details") or str(p.content)
            parts.append(f"- {p.key}: {val}")

    # 6. custom 类型记忆
    customs = await list_memories(db, user_id, memory_type="custom")
    strong_customs = [p for p in customs if p.confidence > 0.7]
    if strong_customs:
        parts.append("[其他高置信记忆]")
        for p in strong_customs[:4]:
            val = p.content.get("value") or p.content.get("summary") or str(p.content)
            parts.append(f"- {p.key}: {val}")

    # 7. rejection 类型记忆
    rejections = await list_memories(db, user_id, memory_type="rejection")
    if rejections:
        parts.append("[用户明确不喜欢]")
        for r in rejections[:5]:
            reason = r.content.get("reason") or r.content.get("subject") or str(r.content)
            parts.append(f"- {reason}")

    return "\n".join(parts)


async def get_or_create_analysis_state(db: AsyncSession, user_id: str) -> MemoryAnalysisState:
    result = await db.execute(
        select(MemoryAnalysisState).where(MemoryAnalysisState.user_id == user_id)
    )
    state = result.scalar_one_or_none()
    if state:
        return state

    state = MemoryAnalysisState(user_id=user_id)
    db.add(state)
    await db.flush()
    return state


async def record_memory_event(
    db: AsyncSession,
    user_id: str,
    event_type: str,
    *,
    role: Optional[str] = None,
    content: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    source: Optional[str] = None,
    project_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    commit: bool = True,
) -> Optional[MemoryEvent]:
    """Append one raw event for session archive, recall, and future skill mining."""
    if not user_id or not event_type:
        return None

    item = MemoryEvent(
        user_id=user_id,
        project_id=project_id,
        conversation_id=conversation_id,
        trace_id=trace_id,
        event_type=event_type,
        role=role,
        content=content,
        payload=payload or {},
        source=source,
    )
    db.add(item)
    if commit:
        await db.commit()
    return item


async def start_task_trace(
    db: AsyncSession,
    user_id: str,
    *,
    user_goal: Optional[str] = None,
    project_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
) -> TaskTrace:
    trace = TaskTrace(
        id=trace_id,
        user_id=user_id,
        project_id=project_id,
        conversation_id=conversation_id,
        user_goal=user_goal,
        planner_actions=[],
        artifacts=[],
        outcome_status="running",
    )
    db.add(trace)
    await db.commit()
    return trace


async def finish_task_trace(
    db: AsyncSession,
    trace_id: str,
    user_id: str,
    *,
    outcome_status: str,
    planner_actions: Optional[List[str]] = None,
    artifacts: Optional[List[Dict[str, Any]]] = None,
    failure_reason: Optional[str] = None,
) -> Optional[TaskTrace]:
    result = await db.execute(
        select(TaskTrace).where(
            and_(TaskTrace.id == trace_id, TaskTrace.user_id == user_id)
        )
    )
    trace = result.scalar_one_or_none()
    if not trace:
        return None

    trace.outcome_status = outcome_status
    trace.planner_actions = planner_actions or []
    trace.artifacts = artifacts or []
    trace.failure_reason = failure_reason
    trace.ended_at = datetime.utcnow()
    await db.commit()
    return trace


ACTION_TOOL_MAP = {
    "run_xhs_search": "xhs_search",
    "analyze_inspiration": "rag",
    "create_rednote_node": "template_node",
    "run_painter": "painter",
    "run_refiner": "refiner",
    "run_xhs_publish": "xhs_publish",
    "run_copy_writing": "copy_writer",
}


def _humanize_action(action: str) -> str:
    labels = {
        "run_xhs_search": "搜索小红书并同步灵感库",
        "analyze_inspiration": "分析灵感并提取结构化内容",
        "create_rednote_node": "生成小红书图文模板节点",
        "run_painter": "生成或重绘图片",
        "run_refiner": "分析图片视觉风格",
        "run_copy_writing": "生成小红书文案",
        "run_xhs_publish": "发布到小红书",
    }
    return labels.get(action, action)


def build_skill_candidate_from_trace(trace: TaskTrace, source: str = "user_saved") -> Dict[str, Any]:
    actions = trace.planner_actions or []
    workflow_steps = [
        {"action": action, "label": _humanize_action(action)}
        for action in actions
    ]
    required_tools = []
    for action in actions:
        tool = ACTION_TOOL_MAP.get(action)
        if tool and tool not in required_tools:
            required_tools.append(tool)

    if "run_xhs_search" in actions and "create_rednote_node" in actions:
        proposed_name = "小红书活动选题到图文模板"
        description = "当用户需要搜索小红书活动灵感，并生成可编辑图文模板时使用。"
        default_preferences = {
            "search_limit": 10,
            "recommended_items": 3,
            "prefer_free_events": True,
        }
    elif "run_painter" in actions:
        proposed_name = "图片生成工作流"
        description = "当用户需要根据对话或画布上下文生成图片时使用。"
        default_preferences = {}
    else:
        proposed_name = "自定义设计工作流"
        description = "当用户需要复用本次对话中形成的设计流程时使用。"
        default_preferences = {}

    trigger_examples = [trace.user_goal] if trace.user_goal else []
    step_lines = "\n".join(f"{idx + 1}. {step['label']}" for idx, step in enumerate(workflow_steps)) or "1. 根据用户目标执行已保存的设计流程"
    guardrails = [
        "不要保存或复用本次任务中的具体搜索词、具体笔记、具体文案。",
        "只复用流程、默认偏好和失败处理方式。",
        "遇到发布、删除、安装外部技能、覆盖长期记忆等高风险动作时必须确认。",
    ]
    if "xhs_search" in required_tools:
        guardrails.append("执行小红书相关步骤前必须先通过登录和扩展预检。")

    guardrail_lines = "\n".join(f"- {item}" for item in guardrails)
    draft_skill_md = f"""# {proposed_name}

## 适用场景
{description}

## 触发示例
{chr(10).join(f"- {item}" for item in trigger_examples) if trigger_examples else "- 用户提出与本流程相似的任务需求。"}

## 默认工作流
{step_lines}

## 默认偏好
{chr(10).join(f"- {key}: {value}" for key, value in default_preferences.items()) if default_preferences else "- 使用用户当前长期记忆中的相关偏好。"}

## 约束
{guardrail_lines}
"""

    return {
        "source": source,
        "source_trace_ids": [trace.id],
        "source_project_id": trace.project_id,
        "proposed_name": proposed_name,
        "trigger_examples": trigger_examples,
        "workflow_steps": workflow_steps,
        "required_tools": required_tools,
        "default_preferences": default_preferences,
        "draft_skill_md": draft_skill_md,
        "confidence": 0.65 if source == "user_saved" else 0.5,
        "status": "draft",
    }


async def create_skill_candidate_from_trace(
    db: AsyncSession,
    user_id: str,
    trace_id: str,
    *,
    source: str = "user_saved",
) -> Optional[SkillCandidate]:
    result = await db.execute(
        select(TaskTrace).where(and_(TaskTrace.id == trace_id, TaskTrace.user_id == user_id))
    )
    trace = result.scalar_one_or_none()
    if not trace:
        return None

    data = build_skill_candidate_from_trace(trace, source=source)
    candidate = SkillCandidate(user_id=user_id, **data)
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)
    return candidate
