import asyncio
import contextvars
from typing import Any


_xhs_progress_queue: contextvars.ContextVar[asyncio.Queue | None] = contextvars.ContextVar(
    "xhs_progress_queue",
    default=None,
)


def set_xhs_progress_queue(queue: asyncio.Queue | None):
    """为当前请求上下文注册一个小红书增量事件队列。"""
    return _xhs_progress_queue.set(queue)


def reset_xhs_progress_queue(token) -> None:
    """恢复上下文中的小红书增量事件队列。"""
    _xhs_progress_queue.reset(token)


def publish_xhs_progress(event: dict[str, Any]) -> bool:
    """向当前请求的 SSE 队列推送一条增量事件。"""
    queue = _xhs_progress_queue.get()
    if queue is None:
        return False
    try:
        queue.put_nowait(event)
        return True
    except asyncio.QueueFull:
        return False
