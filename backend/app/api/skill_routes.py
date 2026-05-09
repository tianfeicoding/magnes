import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from typing import Optional, List, Dict, Any

from app.core.database import get_db
from app.core.users import current_user
from app.models.user import User
from app.memory.models import (
    SkillCandidate,
    TaskTrace,
    InstalledSkill,
    SkillRun,
    SkillPatchProposal,
)
from app.memory import service as memory_service


router = APIRouter(prefix="/skills", tags=["skills"])


class CreateCandidateFromTraceRequest(BaseModel):
    traceId: str
    source: str = "user_saved"


class CreateCandidateFromCanvasRequest(BaseModel):
    projectId: Optional[str] = None
    projectName: Optional[str] = None
    conversationId: Optional[str] = None
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    source: str = "user_saved"


class UpdateCandidateRequest(BaseModel):
    proposedName: Optional[str] = None
    triggerExamples: Optional[List[str]] = None
    workflowSteps: Optional[list] = None
    requiredTools: Optional[List[str]] = None
    defaultPreferences: Optional[dict] = None
    draftSkillMd: Optional[str] = None
    status: Optional[str] = None


class UpdateInstalledSkillRequest(BaseModel):
    enabled: Optional[bool] = None
    manifest: Optional[Dict[str, Any]] = None


class UpdatePatchProposalRequest(BaseModel):
    status: str


def _bump_minor_version(version: Optional[str]) -> str:
    parts = str(version or "1.0.0").split(".")
    try:
        major = int(parts[0]) if len(parts) > 0 else 1
        minor = int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        return "1.1.0"
    return f"{major}.{minor + 1}.0"


def _proposal_human_summary(proposal: SkillPatchProposal) -> str:
    changes = proposal.suggested_changes or []
    first = changes[0] if changes else {}
    if isinstance(first, dict):
        return str(first.get("content") or proposal.issue_summary)
    return str(first or proposal.issue_summary)


def _apply_patch_to_skill_files(installed: InstalledSkill, proposal: SkillPatchProposal) -> str:
    new_version = _bump_minor_version(installed.version)
    install_dir = SKILLS_ROOT / installed.install_path
    skill_md_path = install_dir / "SKILL.md"
    manifest_path = install_dir / "skill.json"
    changelog_path = install_dir / "CHANGELOG.md"
    install_dir.mkdir(parents=True, exist_ok=True)

    current_md = skill_md_path.read_text(encoding="utf-8") if skill_md_path.exists() else f"# {installed.name}\n"
    update_text = _proposal_human_summary(proposal)
    learned_block = (
        "\n\n## Learned Updates\n"
        f"- [{new_version}] {update_text}\n"
    )
    if "## Learned Updates" in current_md:
        current_md = current_md.rstrip() + f"\n- [{new_version}] {update_text}\n"
    else:
        current_md = current_md.rstrip() + learned_block
    skill_md_path.write_text(current_md + "\n", encoding="utf-8")

    manifest = installed.manifest_json or {}
    manifest["version"] = new_version
    manifest.setdefault("learned_updates", [])
    manifest["learned_updates"].append({
        "version": new_version,
        "proposal_id": proposal.id,
        "patch_type": proposal.patch_type,
        "content": update_text,
        "created_at": datetime.utcnow().isoformat(),
    })
    manifest_path.write_text(__import__("json").dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    changelog_entry = (
        f"\n## {new_version} - {datetime.utcnow().strftime('%Y-%m-%d')}\n\n"
        "### Changed\n"
        f"- {update_text}\n\n"
        "### Reason\n"
        f"- {proposal.issue_summary}\n"
    )
    previous_changelog = changelog_path.read_text(encoding="utf-8") if changelog_path.exists() else f"# {installed.name} Changelog\n"
    changelog_path.write_text(previous_changelog.rstrip() + "\n" + changelog_entry, encoding="utf-8")

    installed.version = new_version
    installed.manifest_json = manifest
    flag_modified(installed, "manifest_json")
    installed.updated_at = datetime.utcnow()
    return new_version


SKILLS_ROOT = Path(__file__).resolve().parents[3] / ".agent" / "skills"


def _slugify_skill_name(value: str) -> str:
    normalized = (value or "skill").strip().lower()
    normalized = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", normalized)
    normalized = normalized.strip("-")
    return normalized[:48] or "skill"


def _build_skill_description(candidate: SkillCandidate) -> str:
    triggers = candidate.trigger_examples or []
    if triggers:
        return str(triggers[0])[:300]
    steps = candidate.workflow_steps or []
    if steps:
        first = steps[0]
        if isinstance(first, dict):
            return str(first.get("description") or first.get("label") or first.get("action") or "")[:300]
        return str(first)[:300]
    return f"{candidate.proposed_name} 用户生成技能"


def _build_usage_summary(candidate: SkillCandidate) -> List[str]:
    name = candidate.proposed_name or ""
    tools = set(candidate.required_tools or [])
    trigger_text = " ".join(str(item) for item in (candidate.trigger_examples or []))
    text = f"{name} {trigger_text}"

    if "rednote_workflow" in tools or any(kw in text for kw in ["小红书", "活动合集", "市集", "展览"]):
        return [
            "输入：城市/区域、时间范围、活动主题、活动数量，例如“上海五月热门展览，总结9个”。",
            "可选：模板风格、每页几个活动、是否优先免费/亲子/拍照。",
            "流程：先搜索小红书或使用已选灵感笔记，整理可溯源活动草稿。",
            "出图：用户确认并选择模板后，创建内容输入、模板选择和精细编排节点。",
        ]

    if "image_generation" in tools:
        return [
            "输入：图片主题、视觉风格、用途和尺寸。",
            "可选：参考图、是否拆分图层、是否继续精细编排。",
            "流程：按技能协议生成图片结果，并同步到画布或生图库。",
        ]

    if "canvas_editing" in tools or "canvas_editing" in trigger_text:
        return [
            "输入：本次任务目标、源素材和期望输出。",
            "可选：是否沿用当前画布节点、模板和默认参数。",
            "流程：按保存的画布节点顺序复用这套工作流。",
        ]

    return [
        "输入：本次任务目标、素材来源和期望输出。",
        "可选：默认偏好、是否复用画布节点、是否沿用历史参数。",
        "流程：按该技能保存的工作流步骤执行。",
    ]


def _build_recall_keywords(candidate: SkillCandidate) -> List[str]:
    name = candidate.proposed_name or ""
    tools = set(candidate.required_tools or [])
    trigger_text = " ".join(str(item) for item in (candidate.trigger_examples or []))
    text = f"{name} {trigger_text}"
    keywords = set()

    if "rednote_workflow" in tools or any(kw in text for kw in ["小红书", "活动合集", "市集", "展览"]):
        keywords.update(["小红书", "活动", "活动合集", "市集", "展览", "信息图", "灵感笔记", "模板", "模版"])

    for tool in tools:
        keywords.add(str(tool))

    for chunk in re.split(r"[\s,，。；;：:\-/|、（）()【】\[\]「」]+", name):
        chunk = chunk.strip()
        if len(chunk) >= 2:
            keywords.add(chunk)

    return sorted(keywords)


def _build_recall_rules(candidate: SkillCandidate) -> Dict[str, Any]:
    name = candidate.proposed_name or ""
    tools = set(candidate.required_tools or [])
    trigger_text = " ".join(str(item) for item in (candidate.trigger_examples or []))
    text = f"{name} {trigger_text}"

    if "rednote_workflow" in tools or any(kw in text for kw in ["小红书", "活动合集", "市集", "展览"]):
        return {
            "must_have_any": ["小红书", "灵感库", "灵感笔记"],
            "topic_any": ["活动", "市集", "展览", "快闪", "亲子", "周末去哪"],
            "action_any": ["搜索", "总结", "整理", "生成", "做一组", "合集"],
            "output_any": ["信息图", "模板", "模版", "图片", "图文"],
            "negative_any": ["登录", "发布", "删除", "账号"],
        }

    return {
        "must_have_any": [],
        "topic_any": _build_recall_keywords(candidate),
        "action_any": [],
        "output_any": [],
        "negative_any": [],
    }


def _build_required_slots(candidate: SkillCandidate) -> List[str]:
    name = candidate.proposed_name or ""
    tools = set(candidate.required_tools or [])
    if "rednote_workflow" in tools or any(kw in name for kw in ["小红书", "活动合集", "市集", "展览"]):
        return ["城市/区域", "时间范围", "活动主题", "活动数量"]
    return []


def _build_auto_run_policy(candidate: SkillCandidate) -> str:
    tools = set(candidate.required_tools or [])
    name = candidate.proposed_name or ""
    if "rednote_workflow" in tools or any(kw in name for kw in ["小红书", "活动合集"]):
        return "ask_if_missing"
    return "manual_only"


async def _install_skill_from_candidate(
    db: AsyncSession,
    user_id: str,
    candidate: SkillCandidate,
) -> InstalledSkill:
    result = await db.execute(
        select(InstalledSkill).where(
            and_(
                InstalledSkill.user_id == user_id,
                InstalledSkill.source_candidate_id == candidate.id,
            )
        )
    )
    existing = result.scalar_one_or_none()

    slug = _slugify_skill_name(candidate.proposed_name)
    runtime_skill_id = existing.skill_id if existing else f"user-generated/{slug}-{candidate.id[:8]}"
    install_dir = SKILLS_ROOT / runtime_skill_id
    skill_md_path = install_dir / "SKILL.md"
    manifest_path = install_dir / "skill.json"

    install_dir.mkdir(parents=True, exist_ok=True)
    skill_md_path.write_text(candidate.draft_skill_md or f"# {candidate.proposed_name}\n", encoding="utf-8")

    manifest = {
        "id": runtime_skill_id,
        "name": candidate.proposed_name,
        "description": _build_skill_description(candidate),
        "source": "user_generated",
        "source_candidate_id": candidate.id,
        "tools": candidate.required_tools or [],
        "triggers": candidate.trigger_examples or [],
        "usage_summary": _build_usage_summary(candidate),
        "recall_keywords": _build_recall_keywords(candidate),
        "recall_rules": _build_recall_rules(candidate),
        "required_slots": _build_required_slots(candidate),
        "risk_level": "medium",
        "auto_run_policy": _build_auto_run_policy(candidate),
        "workflow_steps": candidate.workflow_steps or [],
        "version": "1.0.0",
        "generated_at": datetime.utcnow().isoformat(),
    }
    import json
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    if existing:
        existing.name = candidate.proposed_name
        existing.description = manifest["description"]
        existing.install_path = str(install_dir.relative_to(SKILLS_ROOT))
        existing.manifest_json = manifest
        existing.enabled = 1
        existing.updated_at = datetime.utcnow()
        return existing

    installed = InstalledSkill(
        user_id=user_id,
        source_candidate_id=candidate.id,
        skill_id=runtime_skill_id,
        name=candidate.proposed_name,
        description=manifest["description"],
        install_path=str(install_dir.relative_to(SKILLS_ROOT)),
        manifest_json=manifest,
        enabled=1,
        version="1.0.0",
    )
    db.add(installed)
    return installed


NODE_TYPE_LABELS = {
    "input-image": "输入图片",
    "gen-image": "生成图片",
    "fine-tune": "精细编辑",
    "fine-tune-props": "编辑参数",
    "preview": "预览结果",
    "version-gallery": "版本图库",
    "text": "文本内容",
    "image-text-template": "图文模板",
    "rednote-content": "小红书内容",
    "rednote-stylelab": "小红书风格实验",
    "rednote-preview": "小红书预览",
    "style-analyzer": "风格分析",
    "layout-analyzer": "布局分析",
    "style-validator": "风格校验",
    "mask-fill": "遮罩填充",
    "composer": "图层合成",
    "refiner": "图片优化",
    "layer-split": "图层拆解",
}

PLANNER_ACTION_LABELS = {
    "run_xhs_search": "搜索小红书并同步灵感库",
    "analyze_inspiration": "总结灵感库活动并生成结构化活动清单",
    "summary_draft": "总结选中灵感并生成活动草稿",
    "create_rednote_node": "选择图文模板并触发画布节点生成",
    "run_painter": "生成或重绘图片",
    "run_refiner": "分析图片视觉风格",
    "run_copy_writing": "生成小红书文案",
    "run_xhs_publish": "发布到小红书",
}

REDNOTE_ACTIONS = {"run_xhs_search", "analyze_inspiration", "summary_draft", "create_rednote_node"}


def _truncate_large_values(value: Any, max_length: int = 2000) -> Any:
    if isinstance(value, str):
        if value.startswith("data:image") or len(value) > max_length:
            return f"[已省略长内容，长度 {len(value)}]"
        return value
    if isinstance(value, list):
        return [_truncate_large_values(item, max_length) for item in value[:80]]
    if isinstance(value, dict):
        return {
            key: _truncate_large_values(item, max_length)
            for key, item in value.items()
            if key not in {"imageBase64", "base64", "rawImage", "blob"}
        }
    return value


def _node_label(node: Dict[str, Any]) -> str:
    data = node.get("data") or {}
    node_type = node.get("type") or "unknown"
    return (
        data.get("title")
        or data.get("label")
        or data.get("name")
        or NODE_TYPE_LABELS.get(node_type)
        or node_type
    )


def _build_canvas_workflow_steps(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    edge_count_by_target = {}
    for edge in edges:
        target = edge.get("target")
        if target:
            edge_count_by_target[target] = edge_count_by_target.get(target, 0) + 1

    sorted_nodes = sorted(
        nodes,
        key=lambda node: (
            (node.get("position") or {}).get("x", 0),
            (node.get("position") or {}).get("y", 0),
        ),
    )
    steps = []
    for index, node in enumerate(sorted_nodes):
        node_type = node.get("type") or "unknown"
        label = _node_label(node)
        steps.append({
            "index": index + 1,
            "phase": "canvas",
            "nodeId": node.get("id"),
            "nodeType": node_type,
            "label": label,
            "description": f"画布节点：使用「{label}」完成后续编排",
            "inputCount": edge_count_by_target.get(node.get("id"), 0),
        })
    return steps


def _renumber_steps(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{**step, "index": index + 1} for index, step in enumerate(steps)]


def _trace_to_workflow_steps(trace: TaskTrace) -> List[Dict[str, Any]]:
    steps = []
    actions = trace.planner_actions or []
    for action in actions:
        label = PLANNER_ACTION_LABELS.get(action, action)
        description = trace.user_goal or label
        if action == "create_rednote_node" and trace.user_goal:
            description = trace.user_goal.replace("[技能指令]", "").strip()
        steps.append({
            "phase": "dialogue",
            "traceId": trace.id,
            "action": action,
            "label": label,
            "description": description,
        })
    return steps


async def _build_dialogue_workflow_context(
    db: AsyncSession,
    user_id: str,
    conversation_id: Optional[str],
) -> Dict[str, Any]:
    traces: List[TaskTrace] = []
    if conversation_id:
        result = await db.execute(
            select(TaskTrace)
            .where(and_(TaskTrace.user_id == user_id, TaskTrace.conversation_id == conversation_id))
            .order_by(TaskTrace.started_at)
            .limit(20)
        )
        traces = list(result.scalars().all())

    fallback_used = False
    if not traces:
        result = await db.execute(
            select(TaskTrace)
            .where(TaskTrace.user_id == user_id)
            .order_by(desc(TaskTrace.started_at))
            .limit(20)
        )
        recent = list(result.scalars().all())
        traces = [
            trace for trace in recent
            if REDNOTE_ACTIONS & set(trace.planner_actions or [])
        ][:6]
        traces.reverse()
        fallback_used = bool(traces)

    steps = []
    seen = set()
    source_trace_ids = []
    for trace in traces:
        if trace.id not in source_trace_ids:
            source_trace_ids.append(trace.id)
        for step in _trace_to_workflow_steps(trace):
            key = (step.get("action"), step.get("description"))
            if key in seen:
                continue
            seen.add(key)
            steps.append(step)

    return {
        "steps": _renumber_steps(steps),
        "source_trace_ids": source_trace_ids,
        "fallback_used": fallback_used,
    }


def _infer_required_tools(nodes: List[Dict[str, Any]]) -> List[str]:
    tools = set()
    node_types = {node.get("type") for node in nodes}
    if {"rednote-content", "rednote-stylelab", "rednote-preview"} & node_types:
        tools.add("rednote_workflow")
    if {"gen-image", "refiner", "mask-fill"} & node_types:
        tools.add("image_generation")
    if {"style-analyzer", "layout-analyzer", "style-validator"} & node_types:
        tools.add("visual_analysis")
    if {"fine-tune", "fine-tune-props", "composer", "layer-split"} & node_types:
        tools.add("canvas_editing")
    if {"version-gallery", "input-image"} & node_types:
        tools.add("asset_management")
    return sorted(tools)


def _build_canvas_trigger_guides(project_name: str, nodes: List[Dict[str, Any]], tools: List[str]) -> List[str]:
    node_types = {node.get("type") for node in nodes}
    is_rednote_activity = (
        "rednote_workflow" in tools
        or "小红书" in project_name
        or "活动" in project_name
        or "合集" in project_name
    )

    if is_rednote_activity:
        guides = [
            "示例输入：帮我做一组上海五一热门市集活动合集，整理 9 个活动，每页放 3 个活动，用我选中的灵感笔记生成小红书信息图。",
            "必须提供：城市/区域、时间范围、活动主题、活动数量。",
            "可选提供：每页几个活动、免费优先/适合拍照/亲子友好等偏好、是否优先使用已勾选的灵感笔记。",
            "执行边界：先生成可溯源的活动合集草稿；用户确认生成图片并选择模板后，才会创建内容输入、模板选择和精细编排节点。",
        ]
        if "fine-tune" in node_types or "composer" in node_types:
            guides.append("画布触发：在精细编排里调整版式后，可继续保存为新的技能草稿或模板。")
        return guides

    if "image_generation" in tools:
        return [
            "对话触发：说明要生成的图片主题、风格、用途和尺寸。",
            "需要输入：画面主体、视觉风格、使用场景；有参考图时先上传图片。",
            "可选参数：是否拆分图层、是否继续精细编排、是否保存到生图库。",
            f"显式触发：使用「{project_name} 工作流」按当前画布流程再生成一版。",
        ]

    if "canvas_editing" in tools:
        return [
            "画布触发：准备好输入节点后，按当前节点连接顺序执行这套编辑流程。",
            "需要输入：源图片或文本素材，以及每个编辑节点的目标说明。",
            "可选参数：是否保留背景、是否拆分图层、是否保存结果为模板。",
            f"显式触发：使用「{project_name} 工作流」复用当前画布编排。",
        ]

    return [
        f"对话触发：用户提出与「{project_name}」相似的任务时召回此工作流。",
        "需要输入：本次任务目标、素材来源、期望输出格式。",
        "需要选择：是否复用当前画布节点、是否沿用默认参数。",
    ]


def _build_canvas_skill_md(project_name: str, steps: List[Dict[str, Any]], tools: List[str], trigger_guides: List[str]) -> str:
    step_lines = "\n".join(
        f"{step['index']}. {step['label']} ({step.get('action') or step.get('nodeType') or step.get('phase') or 'step'})"
        for step in steps
    ) or "暂无节点步骤"
    tool_lines = "\n".join(f"- {tool}" for tool in tools) or "- 无明确工具依赖"
    trigger_lines = "\n".join(f"- {item}" for item in trigger_guides) or "- 用户提出与本流程相似的任务需求。"
    return f"""# {project_name} 工作流技能草稿

## 适用场景
当用户希望复用「{project_name}」当前画布工作流时，优先召回此技能。

## 如何触发
{trigger_lines}

## 工作流步骤
{step_lines}

## 依赖工具
{tool_lines}

## 使用说明
此草稿来自用户主动保存的当前画布。启用前应检查节点顺序、默认参数、素材依赖和触发条件是否准确。
"""


@router.get("/candidates")
async def list_skill_candidates(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(SkillCandidate).where(SkillCandidate.user_id == user.id)
    if status:
        query = query.where(SkillCandidate.status == status)
    query = query.order_by(desc(SkillCandidate.created_at))
    result = await db.execute(query)
    return {"status": "success", "data": [item.to_dict() for item in result.scalars().all()]}


@router.get("/installed")
async def list_installed_skills(
    enabled: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(InstalledSkill).where(InstalledSkill.user_id == user.id)
    if enabled is not None:
        query = query.where(InstalledSkill.enabled == (1 if enabled else 0))
    query = query.order_by(desc(InstalledSkill.created_at))
    result = await db.execute(query)
    return {"status": "success", "data": [item.to_dict() for item in result.scalars().all()]}


@router.patch("/installed/{installed_id}")
async def update_installed_skill(
    installed_id: str,
    req: UpdateInstalledSkillRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result = await db.execute(
        select(InstalledSkill).where(
            and_(InstalledSkill.id == installed_id, InstalledSkill.user_id == user.id)
        )
    )
    installed = result.scalar_one_or_none()
    if not installed:
        raise HTTPException(status_code=404, detail="Installed skill not found")

    if req.enabled is not None:
        installed.enabled = 1 if req.enabled else 0

    if req.manifest is not None:
        current_manifest = installed.manifest_json or {}
        next_manifest = {**current_manifest, **req.manifest}
        installed.manifest_json = next_manifest
        installed.name = next_manifest.get("name") or installed.name
        installed.description = next_manifest.get("description") or installed.description

        import json
        manifest_path = SKILLS_ROOT / installed.install_path / "skill.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(next_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    installed.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(installed)
    return {"status": "success", "data": installed.to_dict()}


@router.get("/installed/{installed_id}/runs")
async def list_installed_skill_runs(
    installed_id: str,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result = await db.execute(
        select(InstalledSkill).where(
            and_(InstalledSkill.id == installed_id, InstalledSkill.user_id == user.id)
        )
    )
    installed = result.scalar_one_or_none()
    if not installed:
        raise HTTPException(status_code=404, detail="Installed skill not found")

    runs_result = await db.execute(
        select(SkillRun)
        .where(SkillRun.user_id == user.id, SkillRun.installed_skill_id == installed.id)
        .order_by(desc(SkillRun.started_at))
        .limit(max(1, min(limit, 100)))
    )
    return {"status": "success", "data": [run.to_dict() for run in runs_result.scalars().all()]}


@router.get("/patch-proposals")
async def list_patch_proposals(
    status: Optional[str] = "pending",
    skill_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(SkillPatchProposal).where(SkillPatchProposal.user_id == user.id)
    if status:
        query = query.where(SkillPatchProposal.status == status)
    if skill_id:
        query = query.where(SkillPatchProposal.skill_id == skill_id)
    query = query.order_by(desc(SkillPatchProposal.created_at)).limit(50)
    result = await db.execute(query)
    return {"status": "success", "data": [proposal.to_dict() for proposal in result.scalars().all()]}


@router.patch("/patch-proposals/{proposal_id}")
async def update_patch_proposal(
    proposal_id: str,
    req: UpdatePatchProposalRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    if req.status not in {"applied", "ignored"}:
        raise HTTPException(status_code=400, detail="Invalid patch proposal status")

    result = await db.execute(
        select(SkillPatchProposal).where(
            and_(SkillPatchProposal.id == proposal_id, SkillPatchProposal.user_id == user.id)
        )
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Patch proposal not found")
    if proposal.status != "pending":
        return {"status": "success", "data": proposal.to_dict()}

    if req.status == "ignored":
        proposal.status = "ignored"
        proposal.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(proposal)
        return {"status": "success", "data": proposal.to_dict()}

    installed_result = await db.execute(
        select(InstalledSkill).where(
            and_(
                InstalledSkill.user_id == user.id,
                InstalledSkill.skill_id == proposal.skill_id,
            )
        )
    )
    installed = installed_result.scalar_one_or_none()
    if not installed:
        raise HTTPException(status_code=404, detail="Installed skill not found")
    if proposal.base_version and installed.version != proposal.base_version:
        raise HTTPException(status_code=409, detail="Skill version changed; please regenerate proposal")

    new_version = _apply_patch_to_skill_files(installed, proposal)
    proposal.status = "applied"
    proposal.applied_version = new_version
    proposal.approved_at = datetime.utcnow()
    proposal.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(proposal)
    return {"status": "success", "data": proposal.to_dict(), "skill": installed.to_dict()}


@router.post("/candidates/from-trace")
async def create_candidate_from_trace(
    req: CreateCandidateFromTraceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    candidate = await memory_service.create_skill_candidate_from_trace(
        db,
        user.id,
        req.traceId,
        source=req.source or "user_saved",
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Task trace not found")
    return {"status": "success", "data": candidate.to_dict()}


@router.post("/candidates/from-canvas")
async def create_candidate_from_canvas(
    req: CreateCandidateFromCanvasRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    if not req.nodes:
        raise HTTPException(status_code=400, detail="Canvas has no nodes")

    project_name = (req.projectName or "未命名项目").strip() or "未命名项目"
    dialogue_context = await _build_dialogue_workflow_context(db, user.id, req.conversationId)
    canvas_steps = _build_canvas_workflow_steps(req.nodes, req.edges)
    steps = _renumber_steps([*dialogue_context["steps"], *canvas_steps])
    tools = _infer_required_tools(req.nodes)
    trigger_guides = _build_canvas_trigger_guides(project_name, req.nodes, tools)
    candidate = SkillCandidate(
        user_id=user.id,
        source=req.source or "user_saved",
        source_trace_ids=dialogue_context["source_trace_ids"],
        source_project_id=req.projectId,
        proposed_name=f"{project_name} 工作流",
        trigger_examples=trigger_guides,
        workflow_steps=steps,
        required_tools=tools,
        default_preferences={
            "projectName": project_name,
            "conversationId": req.conversationId,
            "workflowContextFallbackUsed": dialogue_context["fallback_used"],
            "canvasSnapshot": {
                "nodes": _truncate_large_values(req.nodes),
                "edges": _truncate_large_values(req.edges),
            },
        },
        draft_skill_md=_build_canvas_skill_md(project_name, steps, tools, trigger_guides),
        confidence=0.65,
        status="draft",
    )
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)
    return {"status": "success", "data": candidate.to_dict()}


@router.patch("/candidates/{candidate_id}")
async def update_skill_candidate(
    candidate_id: str,
    req: UpdateCandidateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result = await db.execute(
        select(SkillCandidate).where(
            and_(SkillCandidate.id == candidate_id, SkillCandidate.user_id == user.id)
        )
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Skill candidate not found")

    if req.proposedName is not None:
        candidate.proposed_name = req.proposedName
    if req.triggerExamples is not None:
        candidate.trigger_examples = req.triggerExamples
    if req.workflowSteps is not None:
        candidate.workflow_steps = req.workflowSteps
    if req.requiredTools is not None:
        candidate.required_tools = req.requiredTools
    if req.defaultPreferences is not None:
        candidate.default_preferences = req.defaultPreferences
    if req.draftSkillMd is not None:
        candidate.draft_skill_md = req.draftSkillMd
    installed_skill = None
    if req.status is not None:
        allowed = {"draft", "approved", "rejected", "published", "deleted"}
        if req.status not in allowed:
            raise HTTPException(status_code=400, detail="Invalid status")
        candidate.status = req.status
        if req.status == "approved":
            installed_skill = await _install_skill_from_candidate(db, user.id, candidate)

    await db.commit()
    await db.refresh(candidate)
    if installed_skill:
        await db.refresh(installed_skill)
    return {
        "status": "success",
        "data": candidate.to_dict(),
        "installedSkill": installed_skill.to_dict() if installed_skill else None,
    }


def _build_use_skill_payload(installed: InstalledSkill) -> Dict[str, Any]:
    manifest = installed.manifest_json or {}
    triggers = manifest.get("triggers") or []
    usage_summary = manifest.get("usage_summary") or []
    starter_prompt = "请告诉我这次任务的目标、素材来源和期望输出。"
    if triggers:
        starter_prompt = str(triggers[0])

    return {
        "activeSkill": installed.skill_id,
        "skillSummary": "\n".join([
            installed.name,
            installed.description or "",
            "\n".join(str(item) for item in (usage_summary or triggers)[:5]),
        ]).strip(),
        "starterPrompt": starter_prompt,
        "skill": installed.to_dict(),
    }


async def _mark_installed_skill_used(db: AsyncSession, installed: InstalledSkill) -> InstalledSkill:
    if not installed:
        raise HTTPException(status_code=404, detail="Installed skill not found")
    if not installed.enabled:
        raise HTTPException(status_code=400, detail="Skill is disabled")

    installed.usage_count = (installed.usage_count or 0) + 1
    installed.last_used_at = datetime.utcnow()
    await db.commit()
    await db.refresh(installed)
    return installed


@router.post("/installed/by-skill/{skill_id:path}/use")
async def use_installed_skill_by_skill_id(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result = await db.execute(
        select(InstalledSkill).where(
            and_(InstalledSkill.skill_id == skill_id, InstalledSkill.user_id == user.id)
        )
    )
    installed = await _mark_installed_skill_used(db, result.scalar_one_or_none())
    return {"status": "success", "data": _build_use_skill_payload(installed)}


@router.post("/installed/{installed_id}/use")
async def use_installed_skill(
    installed_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
):
    result = await db.execute(
        select(InstalledSkill).where(
            and_(InstalledSkill.id == installed_id, InstalledSkill.user_id == user.id)
        )
    )
    installed = await _mark_installed_skill_used(db, result.scalar_one_or_none())
    return {
        "status": "success",
        "data": _build_use_skill_payload(installed),
    }
