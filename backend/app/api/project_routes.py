"""
Project API Routes
负责管理画布项目的 CRUD 接口。
保存/恢复完整的 ReactFlow 画布状态（nodes、edges、viewport）。
"""
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import Optional, List

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from app.core.database import get_db
from app.models.project import Project
from app.models.project_snapshot import ProjectSnapshot
from app.models.user import User
from app.core.users import current_user
from app.memory.models import CanvasActionLog, UserMemory
from app.core.llm_config import get_llm_config

router = APIRouter(
    prefix="/projects",
    tags=["projects"]
)


# ── 辅助函数：从 nodes 生成语义化描述 ──

def _build_action_description(project_name: str, nodes: list, action_type: str = "canvas_save") -> str:
    """根据节点数据生成人类可读的 CanvasActionLog 描述"""
    node_count = len(nodes) if nodes else 0

    # 节点类型 → 中文名映射
    TYPE_LABELS = {
        "fine-tune": "精细编排",
        "fine-tune-props": "精细编排属性",
        "input-image": "输入图片",
        "gen-image": "生成图片",
        "composer": "排版合成",
        "preview": "预览",
        "text-node": "文本",
        "layer-split": "图层分离",
        "refiner": "精修",
        "layout-analyzer": "布局分析",
        "style-analyzer": "风格分析",
        "style-validator": "风格校验",
        "rednote-content": "小红书内容",
        "image-text-template": "图文模版",
        "rednote-stylelab": "风格实验室",
        "rednote-preview": "小红书预览",
        "version-gallery": "版本画廊",
    }

    # 统计各类型节点数量
    type_counts = {}
    for node in nodes or []:
        nt = node.get("type", "unknown") if isinstance(node, dict) else "unknown"
        type_counts[nt] = type_counts.get(nt, 0) + 1

    # 构建节点统计描述
    type_parts = []
    for nt, count in sorted(type_counts.items(), key=lambda x: -x[1])[:3]:
        label = TYPE_LABELS.get(nt, nt)
        type_parts.append(f"{label} x{count}")

    type_summary = f"（{', '.join(type_parts)}）" if type_parts else ""

    if action_type == "project_create":
        return f"用户创建了项目「{project_name}」，包含 {node_count} 个节点{type_summary}"
    elif action_type == "project_rename":
        return f"用户将项目重命名为「{project_name}」"
    elif action_type == "project_delete":
        return f"用户删除了项目「{project_name}」"
    else:
        return f"用户保存了项目「{project_name}」，当前 {node_count} 个节点{type_summary}"


# ── 项目 CRUD ──

@router.get("/")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取当前用户的项目列表（精简版，不含详细 nodes/edges）"""
    result = await db.execute(
        select(Project)
        .where(and_(Project.user_id == user.id, Project.is_deleted == "0"))
        .order_by(desc(Project.updated_at))
    )
    projects = result.scalars().all()
    return {
        "status": "success",
        "data": [p.to_summary_dict() for p in projects]
    }


@router.get("/last/active")
async def get_last_active_project(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取用户最后更新的项目（用于页面刷新后自动恢复）"""
    result = await db.execute(
        select(Project)
        .where(and_(Project.user_id == user.id, Project.is_deleted == "0"))
        .order_by(desc(Project.updated_at))
        .limit(1)
    )
    project = result.scalar_one_or_none()
    if not project:
        return {"status": "success", "data": None}

    return {
        "status": "success",
        "data": project.to_dict()
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取项目完整数据（含 nodes、edges、viewport）"""
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == project_id,
                Project.user_id == user.id,
                Project.is_deleted == "0"
            )
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "status": "success",
        "data": project.to_dict()
    }


@router.post("/")
async def create_project(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """创建新项目，支持传入初始 nodes/edges"""
    project = Project(
        id=data.get("id") or str(uuid.uuid4()),
        user_id=user.id,
        name=data.get("name", "未命名项目"),
        description=data.get("description"),
        nodes=data.get("nodes", []),
        edges=data.get("edges", []),
        viewport=data.get("viewport", {"x": 0, "y": 0, "zoom": 1}),
        settings=data.get("settings", {}),
        conversation_id=data.get("conversationId"),
    )
    db.add(project)
    await db.commit()

    # 记录 CanvasActionLog
    try:
        action_log = CanvasActionLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            conversation_id=project.conversation_id,
            action_type="project_create",
            target_node_id=None,
            payload={
                "project_id": project.id,
                "project_name": project.name,
                "node_count": len(project.nodes) if project.nodes else 0,
                "edge_count": len(project.edges) if project.edges else 0,
            },
            description=_build_action_description(
                project.name, project.nodes, action_type="project_create"
            ),
        )
        db.add(action_log)
        await db.commit()
    except Exception as e:
        print(f"[ProjectRoutes] CanvasActionLog 记录失败: {e}")

    return {
        "status": "success",
        "data": project.to_summary_dict()
    }


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """更新项目画布状态（用于自动保存）"""
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == project_id,
                Project.user_id == user.id,
                Project.is_deleted == "0"
            )
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 只更新传入的字段
    if "name" in data:
        project.name = data["name"]
    if "description" in data:
        project.description = data["description"]
    if "nodes" in data:
        project.nodes = data["nodes"]
    if "edges" in data:
        project.edges = data["edges"]
    if "viewport" in data:
        project.viewport = data["viewport"]
    if "settings" in data:
        project.settings = {**project.settings, **data["settings"]}
    if "conversationId" in data:
        project.conversation_id = data["conversationId"]

    await db.commit()

    # 记录 CanvasActionLog
    try:
        action_hint = data.get("actionHint", "canvas_save")
        action_log = CanvasActionLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            conversation_id=project.conversation_id,
            action_type=action_hint,
            target_node_id=None,
            payload={
                "project_id": project.id,
                "project_name": project.name,
                "node_count": len(project.nodes) if project.nodes else 0,
                "edge_count": len(project.edges) if project.edges else 0,
            },
            description=_build_action_description(
                project.name, project.nodes, action_type=action_hint
            ),
        )
        db.add(action_log)
        await db.commit()
    except Exception as e:
        # ActionLog 记录失败不应影响主流程
        print(f"[ProjectRoutes] CanvasActionLog 记录失败: {e}")

    return {
        "status": "success",
        "data": project.to_summary_dict()
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """软删除项目"""
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == project_id,
                Project.user_id == user.id
            )
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.is_deleted = "1"
    await db.commit()

    # 记录 CanvasActionLog
    try:
        action_log = CanvasActionLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            conversation_id=project.conversation_id,
            action_type="project_delete",
            target_node_id=None,
            payload={
                "project_id": project.id,
                "project_name": project.name,
            },
            description=_build_action_description(
                project.name, project.nodes, action_type="project_delete"
            ),
        )
        db.add(action_log)
        await db.commit()
    except Exception as e:
        print(f"[ProjectRoutes] CanvasActionLog 记录失败: {e}")

    return {"status": "success"}


# ── 项目快照（版本控制）──

@router.post("/{project_id}/snapshots")
async def create_snapshot(
    project_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """为项目创建命名快照（里程碑/版本）"""
    result = await db.execute(
        select(Project).where(
            and_(
                Project.id == project_id,
                Project.user_id == user.id,
                Project.is_deleted == "0"
            )
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    snapshot = ProjectSnapshot(
        id=str(uuid.uuid4()),
        project_id=project_id,
        user_id=user.id,
        nodes=data.get("nodes", project.nodes),
        edges=data.get("edges", project.edges),
        viewport=data.get("viewport", project.viewport),
        name=data.get("name"),
        note=data.get("note"),
    )
    db.add(snapshot)
    await db.commit()

    return {
        "status": "success",
        "data": snapshot.to_dict()
    }


@router.get("/{project_id}/snapshots")
async def list_snapshots(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取项目的所有快照"""
    result = await db.execute(
        select(ProjectSnapshot)
        .where(
            and_(
                ProjectSnapshot.project_id == project_id,
                ProjectSnapshot.user_id == user.id
            )
        )
        .order_by(desc(ProjectSnapshot.created_at))
    )
    snapshots = result.scalars().all()

    return {
        "status": "success",
        "data": [s.to_dict() for s in snapshots]
    }


# ── 细粒度操作日志（CanvasActionLog）──

@router.post("/action-log")
async def log_canvas_action(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """接收前端发送的细粒度画布操作日志"""
    try:
        action_log = CanvasActionLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            conversation_id=data.get("conversationId"),
            action_type=data.get("actionType", "unknown"),
            target_node_id=data.get("targetNodeId"),
            payload=data.get("payload", {}),
            description=data.get("description", ""),
        )
        db.add(action_log)
        await db.commit()
        return {"status": "success", "data": action_log.to_dict()}
    except Exception as e:
        print(f"[ProjectRoutes] CanvasActionLog 接收失败: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/action-log/history")
async def list_action_logs(
    limit: int = 50,
    action_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """获取当前用户的操作日志历史（用于语义检索、审计）"""
    query = select(CanvasActionLog).where(
        CanvasActionLog.user_id == user.id
    ).order_by(desc(CanvasActionLog.created_at)).limit(limit)

    if action_type:
        query = query.where(CanvasActionLog.action_type == action_type)

    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "status": "success",
        "data": [log.to_dict() for log in logs]
    }


# ── 记忆回流：从操作日志提取偏好 ──

class ExtractedPreference(BaseModel):
    memory_type: str = Field(description="记忆类型: preference | style | rejection | workflow | custom")
    key: str = Field(description="偏好名称，如: 主色调偏好、布局偏好")
    content: dict = Field(description="偏好内容，如: { value: '粉色系', details: '...' }")
    confidence: float = Field(description="可信度 0.0~1.0")
    evidence: str = Field(description="提取依据，引用具体的操作日志描述")

class MemoryAnalysisResult(BaseModel):
    preferences: List[ExtractedPreference] = Field(description="提取出的所有偏好列表")
    summary: str = Field(description="对用户整体偏好的中文总结")


async def _analyze_logs_with_llm(logs: List[CanvasActionLog]) -> MemoryAnalysisResult:
    """调用 LLM 分析操作日志，提取用户偏好"""
    base_url, api_key = await get_llm_config()
    if not api_key:
        raise ValueError("Missing API_KEY for LLM analysis")

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        openai_api_key=api_key,
        base_url=base_url,
        temperature=0.2
    )

    # 构建操作日志文本
    log_texts = []
    for log in logs:
        ts = log.created_at.strftime("%m-%d %H:%M") if log.created_at else ""
        log_texts.append(f"[{ts}] {log.action_type}: {log.description}")
    log_content = "\n".join(log_texts)

    system_prompt = """你是一位用户行为分析师。请根据用户的画布操作日志，提取用户的长期偏好和习惯。

输出规则：
1. 只提取明确、可观察的偏好（有多次行为支撑）
2. 每个偏好必须包含：类型(preference/style/rejection/workflow)、名称、内容、可信度(0-1)、依据
3. 如果数据不足，返回空列表，不要编造
4. 使用中文输出

可提取的偏好示例：
- preference: "主色调偏好" → { value: "粉色系" }
- style: "排版风格" → { value: "3图并排", layout: "horizontal" }
- rejection: "颜色排斥" → { value: "蓝色背景", reason: "从未使用" }
- workflow: "工作流偏好" → { value: "对话驱动创建", pattern: "三段式" }
"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", "以下是用户最近的操作日志，请分析并提取偏好：\n\n{logs}")
    ])

    chain = prompt | llm.with_structured_output(MemoryAnalysisResult)
    result = await chain.ainvoke({"logs": log_content})
    return result


@router.post("/analyze-memory")
async def analyze_user_memory(
    data: dict = {},
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    分析用户操作日志，提取偏好写入长期记忆 (UserMemory)
    触发方式：前端主动调用，或后台定时任务
    """
    limit = data.get("limit", 100)

    # 1. 查询用户最近的操作日志
    result = await db.execute(
        select(CanvasActionLog)
        .where(CanvasActionLog.user_id == user.id)
        .order_by(desc(CanvasActionLog.created_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    if not logs:
        return {"status": "success", "data": {"extracted": [], "message": "暂无操作日志可供分析"}}

    # 2. 调用 LLM 分析
    try:
        analysis = await _analyze_logs_with_llm(logs)
    except Exception as e:
        print(f"[ProjectRoutes] LLM 分析失败: {e}")
        return {"status": "error", "message": f"分析失败: {str(e)}"}

    # 3. 写入 UserMemory（去重更新）
    extracted = []
    for pref in analysis.preferences:
        # 查询是否已有同类型同 key 的记忆
        existing_result = await db.execute(
            select(UserMemory).where(
                and_(
                    UserMemory.user_id == user.id,
                    UserMemory.memory_type == pref.memory_type,
                    UserMemory.key == pref.key
                )
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            # 更新：提升 confidence，追加 evidence
            existing.content = pref.content
            existing.confidence = max(existing.confidence, pref.confidence)
            existing.evidence = f"{existing.evidence}\n{pref.evidence}".strip()[-500:]
            existing.updated_at = datetime.utcnow()
        else:
            # 新建
            memory = UserMemory(
                id=str(uuid.uuid4()),
                user_id=user.id,
                memory_type=pref.memory_type,
                key=pref.key,
                content=pref.content,
                confidence=pref.confidence,
                evidence=pref.evidence,
                source_conversation_id=logs[0].conversation_id if logs else None
            )
            db.add(memory)

        extracted.append({
            "memoryType": pref.memory_type,
            "key": pref.key,
            "content": pref.content,
            "confidence": pref.confidence,
            "evidence": pref.evidence
        })

    await db.commit()

    return {
        "status": "success",
        "data": {
            "summary": analysis.summary,
            "extracted": extracted,
            "logCount": len(logs)
        }
    }


@router.get("/memory-analysis/preview")
async def preview_memory_analysis(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """
    预览记忆分析结果（不写入数据库，用于调试）
    """
    result = await db.execute(
        select(CanvasActionLog)
        .where(CanvasActionLog.user_id == user.id)
        .order_by(desc(CanvasActionLog.created_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    if not logs:
        return {"status": "success", "data": {"summary": "暂无操作日志", "preferences": []}}

    try:
        analysis = await _analyze_logs_with_llm(logs)
        return {
            "status": "success",
            "data": {
                "summary": analysis.summary,
                "preferences": [
                    {
                        "memoryType": p.memory_type,
                        "key": p.key,
                        "content": p.content,
                        "confidence": p.confidence,
                        "evidence": p.evidence
                    }
                    for p in analysis.preferences
                ]
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

