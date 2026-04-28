"""
Planner 流式处理逻辑
负责监听 LangGraph 的 astream_events 事件，并将其转换为前端可识别的 SSE (Server-Sent Events) 消息格式。
"""
import asyncio
from datetime import datetime
from typing import AsyncGenerator, Optional
from app.services.xhs_progress import set_xhs_progress_queue, reset_xhs_progress_queue

async def handle_stream_events(planner_graph, input_data, config, message: str, active_image_url: Optional[str]) -> AsyncGenerator[dict, None]:
    """处理 LangGraph 事件流并产生 SSE 事件"""
    sent_event_ids = set()
    sent_actions = set()
    last_reply_content = None
    outbound_queue: asyncio.Queue = asyncio.Queue()
    sentinel = object()
    queue_token = set_xhs_progress_queue(outbound_queue)

    async def emit(event: dict):
        await outbound_queue.put(event)

    async def pump_langgraph_events():
        nonlocal last_reply_content
        try:
            async for event in planner_graph.astream_events(input_data, config, version="v2"):
                kind = event["event"]
                event_id = event.get("id")
                event_name = event.get("name", "unnamed")

                if kind == "on_chat_model_stream":
                    if not any(kw in str(message) for kw in ["时间:", "地点:", "门票:"]):
                        content = event["data"]["chunk"].content
                        if content:
                            await emit({"type": "thought_chunk", "content": content, "timestamp": datetime.now().isoformat()})

                elif kind == "on_chain_end":
                    unique_event_key = f"{event_name}_{event_id or 'none'}"
                    if unique_event_key in sent_event_ids:
                        continue
                    sent_event_ids.add(unique_event_key)

                    output = event.get("data", {}).get("output")
                    decision = output.get("final_decision") if (isinstance(output, dict) and "final_decision" in output) else None

                    if decision:
                        if event_name == "LangGraph" or event_name in [
                            "inspiration_analyst", "security_check", "copy_writer",
                            "planner_agent", "executor_agent", "designer_agent",
                            "creative_agent", "knowledge_agent"
                        ]:
                            is_fast = decision.get("is_fast_path", False)
                            if is_fast and event_name == "LangGraph":
                                continue

                            current_reply = decision.get("reply")
                            current_action = decision.get("action")
                            if event_name == "planner_agent":
                                if decision.get("thought"):
                                    await emit({"type": "thought", "content": decision["thought"]})

                                    if current_reply and is_fast:
                                        _final_act = current_action or "chat"
                                        _params = decision.get("parameters", {})

                                        if active_image_url:
                                            if _params.get("imageUrl") == "REUSE_CONTEXT_IMAGE" or (isinstance(_params.get("imageUrl"), str) and len(_params["imageUrl"]) > 1000):
                                                _params["imageUrl"] = "REUSE_CONTEXT_IMAGE"
                                            if "image_urls" in _params and isinstance(_params["image_urls"], list):
                                                _params["image_urls"] = ["REUSE_CONTEXT_IMAGE" if (u == "REUSE_CONTEXT_IMAGE" or (isinstance(u, str) and len(str(u)) > 1000)) else u for u in _params["image_urls"]]

                                        if current_reply and current_reply != last_reply_content:
                                            last_reply_content = current_reply
                                            await emit({"type": "reply", "content": current_reply, "action": _final_act, "parameters": _params, "follow_up_reply": decision.get("follow_up_reply"), "templates": decision.get("templates")})

                                    if current_reply:
                                        await emit({"type": "thought", "content": f"意图确认：{current_reply}"})
                            else:
                                if decision.get("thought"):
                                    await emit({"type": "thought", "content": decision["thought"]})
                                if current_reply and current_reply != last_reply_content:
                                    last_reply_content = current_reply
                                    await emit({
                                        "type": "reply",
                                        "content": current_reply,
                                        "imageUrl": decision.get("image_url") or decision.get("imageUrl") or decision.get("parameters", {}).get("imageUrl"),
                                        "follow_up_reply": decision.get("follow_up_reply"),
                                        "templates": decision.get("templates")
                                    })

                            if current_action and current_action != "chat" and current_action not in sent_actions:
                                sent_actions.add(current_action)
                                params = decision.get("parameters", {})
                                if active_image_url:
                                    if params.get("imageUrl") == "REUSE_CONTEXT_IMAGE":
                                        params["imageUrl"] = active_image_url
                                    if "image_urls" in params and isinstance(params["image_urls"], list):
                                        params["image_urls"] = [active_image_url if u == "REUSE_CONTEXT_IMAGE" else u for u in params["image_urls"]]
                                await emit({"type": "action", "action": current_action, "parameters": params})

                            if decision.get("xhs_precheck_failed"):
                                await emit({"type": "xhs_precheck_failed", "payload": decision["xhs_precheck_failed"]})

                            if decision.get("results"):
                                await emit({"type": "results", "results": decision["results"]})

                            if decision.get("refresh_rag"):
                                await emit({"type": "refresh_rag"})

                    if event_name == "LangGraph":
                        if decision and decision.get("is_fast_path"):
                            await asyncio.sleep(0.2)
        except Exception as e:
            await emit({"type": "error", "message": f"重构内核异常: {str(e)}"})
        finally:
            await emit({"type": "done"})
            await outbound_queue.put(sentinel)

    pump_task = asyncio.create_task(pump_langgraph_events())
    try:
        while True:
            event = await outbound_queue.get()
            if event is sentinel:
                break
            yield event
    finally:
        reset_xhs_progress_queue(queue_token)
        if not pump_task.done():
            pump_task.cancel()
