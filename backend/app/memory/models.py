# backend/app/memory/models.py
import uuid
from datetime import datetime
from sqlalchemy import Column, String, JSON, DateTime, Float, Index, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserMemory(Base):
    __tablename__ = "user_memories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    # 记忆类型: preference | soul | template | style | rejection | workflow | custom
    memory_type = Column(String, nullable=False, index=True)

    # 人类可读的记忆标题/键名
    key = Column(String, nullable=False)

    # 记忆内容，结构化存储
    content = Column(JSON, nullable=False)

    # 可信度/强度 (0.0 ~ 1.0)，用于后续排序和淘汰
    confidence = Column(Float, default=0.5)

    # 证据摘要 (如 "用户连续3次选择粉色活动模版")
    evidence = Column(String)

    # 来源会话 ID，用于追溯
    source_conversation_id = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 复合索引：快速查询某用户的某类记忆
    __table_args__ = (
        Index("ix_user_memories_user_type", "user_id", "memory_type"),
        UniqueConstraint("user_id", "memory_type", "key", name="uq_user_memories_user_type_key"),
    )

    owner = relationship("User", back_populates="memories")

    def to_dict(self):
        return {
            "id": self.id,
            "memoryType": self.memory_type,
            "key": self.key,
            "content": self.content,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "sourceConversationId": self.source_conversation_id,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(String, nullable=False, index=True)

    # 被摘要覆盖的消息范围 (0 ~ N)
    message_start_index = Column(Integer, default=0)
    message_end_index = Column(Integer, nullable=False)

    # LLM 生成的结构化摘要
    summary_text = Column(String, nullable=False)

    # 提取的关键任务状态、决策、TODO、节点引用
    structured_summary = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_conv_summaries_conv", "conversation_id", "message_end_index"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "conversationId": self.conversation_id,
            "messageStartIndex": self.message_start_index,
            "messageEndIndex": self.message_end_index,
            "summaryText": self.summary_text,
            "structuredSummary": self.structured_summary,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class CanvasActionLog(Base):
    __tablename__ = "canvas_action_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(String, nullable=True, index=True)

    # 动作类型: node_create | node_delete | node_update | edge_connect | asset_replace | text_edit | publish
    action_type = Column(String, nullable=False, index=True)

    # 目标节点 ID
    target_node_id = Column(String, nullable=True, index=True)

    # 动作详情 JSON
    payload = Column(JSON, nullable=False)

    # 用于语义检索的文本快照
    description = Column(String, nullable=False, default="")

    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "actionType": self.action_type,
            "targetNodeId": self.target_node_id,
            "payload": self.payload,
            "description": self.description,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class MemoryEvent(Base):
    __tablename__ = "memory_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String, nullable=True, index=True)
    conversation_id = Column(String, nullable=True, index=True)
    trace_id = Column(String, nullable=True, index=True)

    # session_message | planner_action | tool_call | tool_result | canvas_action | artifact_created | user_feedback
    event_type = Column(String, nullable=False, index=True)
    role = Column(String, nullable=True)
    content = Column(String, nullable=True)
    payload = Column(JSON, default=dict)
    source = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_memory_events_user_conv_created", "user_id", "conversation_id", "created_at"),
        Index("ix_memory_events_user_type_created", "user_id", "event_type", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "projectId": self.project_id,
            "conversationId": self.conversation_id,
            "traceId": self.trace_id,
            "eventType": self.event_type,
            "role": self.role,
            "content": self.content,
            "payload": self.payload,
            "source": self.source,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class MemoryAnalysisState(Base):
    __tablename__ = "memory_analysis_states"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    last_event_created_at = Column(DateTime, nullable=True)
    last_event_id = Column(String, nullable=True)
    analyzed_event_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "lastEventCreatedAt": self.last_event_created_at.isoformat() if self.last_event_created_at else None,
            "lastEventId": self.last_event_id,
            "analyzedEventCount": self.analyzed_event_count,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class TaskTrace(Base):
    __tablename__ = "task_traces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(String, nullable=True, index=True)
    conversation_id = Column(String, nullable=True, index=True)

    user_goal = Column(String, nullable=True)
    planner_actions = Column(JSON, default=list)
    artifacts = Column(JSON, default=list)
    outcome_status = Column(String, default="running", index=True)
    failure_reason = Column(String, nullable=True)

    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    ended_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_task_traces_user_conv_started", "user_id", "conversation_id", "started_at"),
        Index("ix_task_traces_user_status_started", "user_id", "outcome_status", "started_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "projectId": self.project_id,
            "conversationId": self.conversation_id,
            "userGoal": self.user_goal,
            "plannerActions": self.planner_actions,
            "artifacts": self.artifacts,
            "outcomeStatus": self.outcome_status,
            "failureReason": self.failure_reason,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "endedAt": self.ended_at.isoformat() if self.ended_at else None,
        }


class SkillCandidate(Base):
    __tablename__ = "skill_candidates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    source = Column(String, default="user_saved", index=True)
    source_trace_ids = Column(JSON, default=list)
    source_project_id = Column(String, nullable=True, index=True)

    proposed_name = Column(String, nullable=False)
    trigger_examples = Column(JSON, default=list)
    workflow_steps = Column(JSON, default=list)
    required_tools = Column(JSON, default=list)
    default_preferences = Column(JSON, default=dict)
    draft_skill_md = Column(String, nullable=False)
    confidence = Column(Float, default=0.5)
    status = Column(String, default="draft", index=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_skill_candidates_user_status_created", "user_id", "status", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "source": self.source,
            "sourceTraceIds": self.source_trace_ids,
            "sourceProjectId": self.source_project_id,
            "proposedName": self.proposed_name,
            "triggerExamples": self.trigger_examples,
            "workflowSteps": self.workflow_steps,
            "requiredTools": self.required_tools,
            "defaultPreferences": self.default_preferences,
            "draftSkillMd": self.draft_skill_md,
            "confidence": self.confidence,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class InstalledSkill(Base):
    __tablename__ = "installed_skills"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    source_candidate_id = Column(String, ForeignKey("skill_candidates.id"), nullable=True, index=True)

    skill_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    install_path = Column(String, nullable=False)
    manifest_json = Column(JSON, default=dict)
    enabled = Column(Integer, default=1, index=True)
    version = Column(String, default="1.0.0")
    usage_count = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", name="uq_installed_skills_user_skill"),
        Index("ix_installed_skills_user_enabled_created", "user_id", "enabled", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "sourceCandidateId": self.source_candidate_id,
            "skillId": self.skill_id,
            "name": self.name,
            "description": self.description,
            "installPath": self.install_path,
            "manifest": self.manifest_json,
            "enabled": bool(self.enabled),
            "version": self.version,
            "usageCount": self.usage_count,
            "lastUsedAt": self.last_used_at.isoformat() if self.last_used_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


class SkillRun(Base):
    __tablename__ = "skill_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(String, nullable=False, index=True)
    installed_skill_id = Column(String, ForeignKey("installed_skills.id"), nullable=True, index=True)
    skill_version = Column(String, nullable=True)

    project_id = Column(String, nullable=True, index=True)
    conversation_id = Column(String, nullable=True, index=True)
    trace_id = Column(String, nullable=True, index=True)
    trigger_source = Column(String, nullable=True, index=True)

    input_message = Column(String, nullable=True)
    active_context = Column(JSON, default=dict)
    planner_actions = Column(JSON, default=list)
    tool_calls = Column(JSON, default=list)
    canvas_changes = Column(JSON, default=list)
    final_output = Column(JSON, default=dict)

    status = Column(String, default="running", index=True)
    error_message = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    ended_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_skill_runs_user_skill_started", "user_id", "skill_id", "started_at"),
        Index("ix_skill_runs_user_status_started", "user_id", "status", "started_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "skillId": self.skill_id,
            "installedSkillId": self.installed_skill_id,
            "skillVersion": self.skill_version,
            "projectId": self.project_id,
            "conversationId": self.conversation_id,
            "traceId": self.trace_id,
            "triggerSource": self.trigger_source,
            "inputMessage": self.input_message,
            "activeContext": self.active_context,
            "plannerActions": self.planner_actions,
            "toolCalls": self.tool_calls,
            "canvasChanges": self.canvas_changes,
            "finalOutput": self.final_output,
            "status": self.status,
            "errorMessage": self.error_message,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "endedAt": self.ended_at.isoformat() if self.ended_at else None,
        }


class SkillFeedbackEvent(Base):
    __tablename__ = "skill_feedback_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(String, nullable=False, index=True)
    skill_run_id = Column(String, ForeignKey("skill_runs.id"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    user_message = Column(String, nullable=True)
    before_state = Column(JSON, default=dict)
    after_state = Column(JSON, default=dict)
    detected_issue = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_skill_feedback_user_skill_created", "user_id", "skill_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "skillId": self.skill_id,
            "skillRunId": self.skill_run_id,
            "eventType": self.event_type,
            "userMessage": self.user_message,
            "beforeState": self.before_state,
            "afterState": self.after_state,
            "detectedIssue": self.detected_issue,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class SkillPatchProposal(Base):
    __tablename__ = "skill_patch_proposals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    skill_id = Column(String, nullable=False, index=True)
    installed_skill_id = Column(String, ForeignKey("installed_skills.id"), nullable=True, index=True)
    base_version = Column(String, nullable=True)
    issue_summary = Column(String, nullable=False)
    patch_type = Column(String, default="behavior_rule", index=True)
    suggested_changes = Column(JSON, default=list)
    risk = Column(String, default="medium")
    status = Column(String, default="pending", index=True)
    created_from_run_id = Column(String, ForeignKey("skill_runs.id"), nullable=True, index=True)
    feedback_event_id = Column(String, ForeignKey("skill_feedback_events.id"), nullable=True, index=True)
    applied_version = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    approved_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_skill_patch_user_status_created", "user_id", "status", "created_at"),
        Index("ix_skill_patch_user_skill_status", "user_id", "skill_id", "status"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "skillId": self.skill_id,
            "installedSkillId": self.installed_skill_id,
            "baseVersion": self.base_version,
            "issueSummary": self.issue_summary,
            "patchType": self.patch_type,
            "suggestedChanges": self.suggested_changes,
            "risk": self.risk,
            "status": self.status,
            "createdFromRunId": self.created_from_run_id,
            "feedbackEventId": self.feedback_event_id,
            "appliedVersion": self.applied_version,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "approvedAt": self.approved_at.isoformat() if self.approved_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
