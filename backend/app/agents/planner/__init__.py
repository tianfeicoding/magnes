"""
Planner 模块入口
负责导出核心接口 run_planner 以及历史记录管理相关函数。
"""
import os
import base64
import asyncio
from pathlib import Path
from datetime import datetime
from typing import AsyncGenerator, Optional, List

from langchain_core.messages import HumanMessage, AIMessage

from .state import PlannerState
from . import graph
from .graph import init_planner_graph
from .history import (
    add_planner_history, 
    get_planner_history, 
    clear_planner_history, 
    delete_planner_session, 
    get_all_sessions
)
from .streaming import handle_stream_events

async def run_planner(
    message: str,
    conversation_id: str,
    canvas_context: Optional[dict] = None,
    active_skill: Optional[str] = None,
    skill_summary: Optional[str] = None,
    active_image_url: Optional[str] = None,
    active_image_ratio: Optional[str] = None,
    extra_context: Optional[dict] = None,
    memory_summary: Optional[str] = None,
    **kwargs
) -> AsyncGenerator[dict, None]:
    """流式运行 Planner 接口"""
    active_tab = (extra_context or {}).get("activeTab")
    
    if graph.planner_graph is None:
        await init_planner_graph()
    
    planner_graph = graph.planner_graph
    config = {"configurable": {"thread_id": conversation_id}}

    # 核心：状态补全 (重要！确保点击按钮时能找回图片和技能上下文)
    print(f"[Planner Entry] 📥 正在为 Thread {conversation_id} 检索状态... (Tab: {active_tab})", flush=True)
    is_new_image = active_image_url is not None # 记录是否是本次请求传入的新图
    try:
        if graph.planner_graph is None: await init_planner_graph()
        state_snapshot = await graph.planner_graph.aget_state(config)
        
        # 补全图片
        if not active_image_url and state_snapshot.values.get("active_image_url"):
            active_image_url = state_snapshot.values["active_image_url"]
            is_new_image = False # 这是从状态找回的，不是新上传的
            print(f"[Planner Entry] 🔍 已从持久化状态找回图片: {active_image_url[:40]}...")
            
        # 补全技能
        if not active_skill and state_snapshot.values.get("active_skill"):
            active_skill = state_snapshot.values["active_skill"]
            print(f"[Planner Entry] 🔍 已从持久化状态找回激活技能: {active_skill}")
            
        if not active_image_ratio and state_snapshot.values.get("active_image_ratio"):
            active_image_ratio = state_snapshot.values["active_image_ratio"]
            print(f"[Planner Entry] 🔍 已从持久化状态找回图片比例: {active_image_ratio}")
            
        if not skill_summary and state_snapshot.values.get("skill_summary"):
            skill_summary = state_snapshot.values["skill_summary"]
            
        # 场景隔离：灵感库页签下强制停用电商识别技能
        if active_tab == 'xhs' and active_skill == 'ecommerce-image-gen':
            print(f"[Planner Entry] 🛡️ 场景隔离: 检测到灵感库页签，强制停用历史电商技能状态。")
            active_skill = None
            skill_summary = None

    except Exception as e:
        import traceback
        print(f"[Planner Entry] ⚠️ 状态回填失败: {e}\n{traceback.format_exc()}")

    # 图片处理与压缩
    # 增加排重逻辑。对于 UI 触发的指令且图片已在上下文中，不再重复挂载到消息正文
    is_ui_command = str(message or "").startswith("[技能指令]")
    
    # 只有当它是新上传的图片且不是 UI 指令时，才将其封装进 HumanMessage (这样才会被持久化到对话历史)
    if active_image_url and is_new_image and not is_ui_command:
        content_list = [{"type": "text", "text": message or "请分析该图片并给出下一步操作。"}]
        if "localhost" in active_image_url and "/uploads/" in active_image_url:
            try:
                filename = active_image_url.split("/")[-1]
                base_dir = Path(__file__).parent.parent.parent.parent
                filepath = base_dir / "data" / "uploads" / filename
                if filepath.exists():
                    from PIL import Image
                    import io
                    with Image.open(filepath) as img:
                        if img.mode in ("RGBA", "P"): img = img.convert("RGB")
                        img.thumbnail((600, 600))
                        buffer = io.BytesIO()
                        img.save(buffer, format="JPEG", quality=50)
                        b64_data = base64.b64encode(buffer.getvalue()).decode()
                        active_image_url = f"data:image/jpeg;base64,{b64_data}"
            except Exception as e:
                print(f"[Planner Entry] ⚠️ 图片转 Base64 失败: {e}")

        if str(active_image_url).startswith("http") or str(active_image_url).startswith("data:"):
             content_list.append({"type": "image_url", "image_url": {"url": active_image_url}})
        messages = [HumanMessage(content=content_list)]
    else:
        messages = [HumanMessage(content=message)]

    input_data = {"messages": messages}
    if canvas_context: input_data["canvas_context"] = canvas_context
    if active_skill: input_data["active_skill"] = active_skill
    if skill_summary: input_data["skill_summary"] = skill_summary
    if active_image_url: input_data["active_image_url"] = active_image_url
    if active_image_ratio: input_data["active_image_ratio"] = active_image_ratio
    if extra_context: input_data["extra_context"] = extra_context
    if memory_summary: input_data["memory_summary"] = memory_summary

    # PRE-GRAPH FAST PATH
    IMAGE_UPLOAD_KEYWORDS = ["上传了一张图片", "上传了图片", "参考图", "我发了图", "图片上传", "发张图"]
    active_tab = (extra_context or {}).get("activeTab")
    
    # 检查画布上是否已经有模版节点，如果在模版操作流中，就不要干扰推销 Skill
    canvas_nodes = (canvas_context or {}).get("nodes", []) if hasattr(canvas_context, 'get') else []
    has_template = any(n.get("type") in ["image-text-template", "fine-tune"] for n in canvas_nodes)

    if active_image_url and any(kw in (message or "") for kw in IMAGE_UPLOAD_KEYWORDS) and active_tab != 'xhs':
        if has_template:
            img_reply = "已自动同步图片到画布，可将其拖入模版占位符中。"
        else:
            img_reply = "已同步图片到画布，您可以尝试：\n1. **[电商生图Skill]**\n2. **AI 绘图**"

        yield {"type": "thought", "content": "识别到新图片，执行 mirror_image 建议。"}
        yield {"type": "reply", "content": img_reply}
        yield {"type": "action", "action": "mirror_image", "parameters": {"imageUrl": active_image_url}}
        
        if planner_graph:
            try:
                await planner_graph.aupdate_state(config, {
                    "messages": messages + [AIMessage(content=img_reply)],
                    "active_image_url": active_image_url,
                    "active_image_ratio": active_image_ratio,
                })
            except: pass
        yield {"type": "done"}
        return

    # 流式监听
    async for event in handle_stream_events(planner_graph, input_data, config, message, active_image_url):
        yield event

__all__ = [
    "run_planner", 
    "add_planner_history", 
    "get_planner_history", 
    "clear_planner_history", 
    "delete_planner_session", 
    "get_all_sessions",
    "init_planner_graph",
    "PlannerState"
]
