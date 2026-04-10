"""
Planner 状态定义
使用 TypedDict 定义 LangGraph 的状态结构，并提供消息合并及值保留的归约逻辑（Reducer）。
"""
from typing import Annotated, Optional, TypedDict, Any
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

def merge_dict(old: Optional[dict], new: Optional[dict]) -> dict:
    """字典合并逻辑：允许部分更新，且不被 None 覆盖"""
    return {**(old or {}), **(new or {})}

def preserve_value(old: Any, new: Any) -> Any:
    """值保留逻辑：新值优先，但新值为 None 时保留旧值"""
    return new if new is not None else old

class PlannerState(TypedDict):
    """Planner 图的状态定义"""
    # 消息历史，使用 add_messages 允许自动追加
    messages: Annotated[list[BaseMessage], add_messages]
    # 对话中涉及的画布上下文 (增强：合并模式)
    canvas_context: Annotated[Optional[dict], merge_dict]
    # 对话中涉及的业务技能信息
    active_skill: Annotated[Optional[str], preserve_value]
    skill_summary: Annotated[Optional[str], preserve_value]
    # 当前引用的图片 URL (增强：值保留模式)
    active_image_url: Annotated[Optional[str], preserve_value]
    # 当前引用的图片比例 (1:1, 3:4, 4:3等)
    active_image_ratio: Annotated[Optional[str], preserve_value]
    # 对话历史摘要 (用于长对话管理)
    conversation_summary: Annotated[Optional[str], preserve_value]
    # 最终业务决策结果
    final_decision: Optional[dict]
    # 最近一次提取或确认的结构化活动内容（用于映射到图片模版）
    structured_content: Annotated[Optional[dict], merge_dict]
    # 扩展上下文（如选中的文档 ID 等）
    extra_context: Annotated[Optional[dict], merge_dict]
