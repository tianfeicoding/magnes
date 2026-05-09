"""
对话内容摘要节点
当消息历史过长时，自动触发摘要生成以压缩上下文并保留关键意图。
"""
import json
import re
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, RemoveMessage, BaseMessage
from .state import PlannerState


SOFT_TOKEN_THRESHOLD = 10_000
HARD_TOKEN_THRESHOLD = 14_000
MESSAGE_FALLBACK_THRESHOLD = 80
DEFAULT_KEEP_RECENT_MESSAGES = 8
HARD_KEEP_RECENT_MESSAGES = 4

STAGE_COMPLETION_ACTIONS = {
    "run_xhs_search",
    "summary_draft",
    "analyze_inspiration",
    "create_rednote_node",
    "run_copy_writing",
    "run_ingest_urls",
    "run_painter",
    "optimize_prompt",
    "mirror_image",
    "export_canvas_image",
    "save_prompt",
}


def _message_text(message: BaseMessage) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("type") or "[structured]"))
            else:
                parts.append(str(item))
        content = " ".join(parts)
    elif isinstance(content, (dict, tuple)):
        content = json.dumps(content, ensure_ascii=False, default=str)
    else:
        content = str(content)

    # Do not let large inline images dominate compaction decisions.
    return re.sub(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]{100,}", "[UserUploadedImage]", content)


def _estimate_tokens(messages: list[BaseMessage], conversation_summary: str = "") -> int:
    # Rough mixed Chinese/English heuristic. It intentionally overestimates a bit
    # because this is only used as a safety trigger before calling the LLM.
    text = "\n".join(_message_text(m) for m in messages)
    if conversation_summary:
        text = f"{conversation_summary}\n{text}"
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    non_ascii_chars = max(len(text) - ascii_chars, 0)
    return int(ascii_chars / 4 + non_ascii_chars / 1.8)


def _current_project_id(state: PlannerState) -> str:
    extra_context = state.get("extra_context") or {}
    return str(
        extra_context.get("projectId")
        or extra_context.get("project_id")
        or ""
    )


def _compaction_reason(state: PlannerState, estimated_tokens: int) -> tuple[bool, str, int]:
    messages = state.get("messages") or []
    message_count = len(messages)
    if estimated_tokens >= HARD_TOKEN_THRESHOLD:
        return True, "hard_token_threshold", HARD_KEEP_RECENT_MESSAGES
    if message_count >= MESSAGE_FALLBACK_THRESHOLD:
        return True, "message_fallback_threshold", DEFAULT_KEEP_RECENT_MESSAGES

    if estimated_tokens < SOFT_TOKEN_THRESHOLD:
        return False, "below_soft_threshold", DEFAULT_KEEP_RECENT_MESSAGES

    final_decision = state.get("final_decision") or {}
    action = final_decision.get("action")
    if action in STAGE_COMPLETION_ACTIONS:
        return True, f"stage_completed:{action}", DEFAULT_KEEP_RECENT_MESSAGES

    extra_context = state.get("extra_context") or {}
    current_skill = state.get("active_skill") or ""
    last_compacted_skill = extra_context.get("_last_compacted_active_skill")
    if last_compacted_skill and current_skill != last_compacted_skill:
        return True, "skill_switched", DEFAULT_KEEP_RECENT_MESSAGES

    current_project_id = _current_project_id(state)
    last_compacted_project_id = extra_context.get("_last_compacted_project_id")
    if last_compacted_project_id and current_project_id and current_project_id != last_compacted_project_id:
        return True, "project_switched", DEFAULT_KEEP_RECENT_MESSAGES

    return False, "waiting_for_safe_boundary", DEFAULT_KEEP_RECENT_MESSAGES


async def summarize_conversation(state: PlannerState):
    """自动摘要节点：按 token 阈值和安全阶段压缩旧消息并保留意图。"""
    print("--- [Summarizer] 节点开始检查 ---", flush=True)
    messages = state.get("messages") or []
    estimated_tokens = _estimate_tokens(messages, state.get("conversation_summary") or "")
    should_compact, reason, keep_recent = _compaction_reason(state, estimated_tokens)

    print(
        f"--- [Summarizer] messages={len(messages)}, estimated_tokens={estimated_tokens}, "
        f"reason={reason}, should_compact={should_compact} ---",
        flush=True,
    )

    if not should_compact:
        return {}

    if len(messages) <= keep_recent:
        print(
            f"[Summarizer] ⚠️ 触发压缩但可压缩消息不足: messages={len(messages)}, keep_recent={keep_recent}",
            flush=True,
        )
        return {}

    print(f"\n[Summarizer] 🧹 触发自动压缩: {reason} (tokens≈{estimated_tokens}, messages={len(messages)})")
    
    from .planner_agent import get_planner_llm
    llm = await get_planner_llm()
    
    summary_prompt = (
        "你是一个记忆管理器。请压缩以下旧对话，只保留对后续执行有用的信息。"
        "请用中文，结构清晰，避免复述无关寒暄。必须覆盖：当前目标、已完成步骤、用户约束、"
        "已选素材或模板、当前技能、已生成产物、待解决问题、下一步建议。"
    )
    
    summary_input = messages[:-keep_recent]
    response = await llm.ainvoke([
        SystemMessage(content=summary_prompt),
        HumanMessage(content=f"请总结以下对话：\n{messages_to_prompt(summary_input)}")
    ])
    
    new_summary = response.content
    print(f"[Summarizer] ✅ 摘要生成成功: {new_summary[:50]}...")

    extra_context = state.get("extra_context") or {}
    user_id = extra_context.get("user_id")
    conversation_id = extra_context.get("conversation_id")
    current_project_id = _current_project_id(state)
    structured_summary = {
        "trigger_reason": reason,
        "estimated_tokens": estimated_tokens,
        "message_count_before": len(messages),
        "kept_recent_messages": keep_recent,
        "active_skill": state.get("active_skill"),
        "project_id": current_project_id,
        "final_action": (state.get("final_decision") or {}).get("action"),
    }
    if user_id and conversation_id:
        try:
            from app.core.database import AsyncSessionLocal
            from app.memory.models import ConversationSummary

            async with AsyncSessionLocal() as session:
                session.add(ConversationSummary(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    message_start_index=0,
                    message_end_index=max(len(summary_input) - 1, 0),
                    summary_text=str(new_summary),
                    structured_summary=structured_summary,
                ))
                await session.commit()
        except Exception as e:
            print(f"[Summarizer] ⚠️ 会话摘要持久化失败: {e}")

    return {
        "conversation_summary": new_summary,
        "extra_context": {
            "_last_compacted_active_skill": state.get("active_skill") or "",
            "_last_compacted_project_id": current_project_id,
            "_last_compaction_reason": reason,
            "_last_compaction_estimated_tokens": estimated_tokens,
        },
        "messages": [RemoveMessage(id=m.id) for m in summary_input] 
    }

def messages_to_prompt(messages: list[BaseMessage]) -> str:
    """将消息列表转换为纯文本字符串供摘要使用"""
    res = []
    for m in messages:
        role = "用户" if isinstance(m, HumanMessage) else "助手"
        res.append(f"{role}: {_message_text(m)}")
    return "\n".join(res)
