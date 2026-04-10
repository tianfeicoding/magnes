"""
Planner 历史记录管理
负责从持久化数据库（SQLite）中读取、回填、清空对话 Thread 的历史消息。
"""
import os
import json
import re
import aiosqlite
from typing import List, Optional, Any
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from .parser import _parse_planner_response

# 注意：planner_graph 将在 graph.py 中定义并由 __init__.py 或 graph.py 管理。
# 这里的函数可能需要动态导入以避免循环依赖。

async def get_planner_graph():
    from . import graph
    if graph.planner_graph is None:
        from .graph import init_planner_graph
        await init_planner_graph()
    return graph.planner_graph

async def add_planner_history(conversation_id: str, content: str, role: str = "assistant", image_url: Optional[str] = None):
    """
    手动向 Planner 的 thread 历史中插入一条消息。支持多模态图片。
    """
    planner_graph = await get_planner_graph()
    if planner_graph:
        config = {"configurable": {"thread_id": conversation_id}}
        
        # 构造多模态内容或纯文本内容
        if image_url:
            if role == "user":
                # 用户消息：支持标准多模态格式
                msg_content = [
                    {"type": "text", "text": content},
                    {"type": "image_url", "image_url": {"url": image_url}}
                ]
            else:
                # 助手消息：LLM 限制其内容必须为纯文本，否则下一次对话会报 400 错误
                # 我们将图片 URL 以隐藏注释形式追加到末尾，get_planner_history 中的正则能自动提取出 imageUrl 供前端显示
                msg_content = f"{content}\n\n<!-- image_url: {image_url} -->"
        else:
            msg_content = content
            
        message = HumanMessage(content=msg_content) if role == "user" else AIMessage(content=msg_content)
        await planner_graph.aupdate_state(config, {"messages": [message]})
        print(f"[Planner Memory] ✅ 成功回填 {role} 消息 (含图片: {bool(image_url)}) 到 Thread: {conversation_id}")
    else:
        print("[Planner Memory] ❌ 无法回填：引擎初始化失败")

async def get_planner_history(conversation_id: str) -> List[dict]:
    """
    获取对话历史，并转换为前端可识别的格式。
    支持从多模态消息中提取 imageUrl 字段。
    """
    planner_graph = await get_planner_graph()
    if not planner_graph:
        print("[get_planner_history] ❌ planner_graph 为 None，无法获取历史")
        return []

    try:
        config = {"configurable": {"thread_id": conversation_id}}
        state = await planner_graph.aget_state(config)
        
        messages = state.values.get("messages", [])
        if not messages:
            print(f"[get_planner_history] ℹ️ 会话 {conversation_id} 无消息记录")
            return []

        # 转换消息格式
        history = []
        for i, m in enumerate(messages):
            try:
                if isinstance(m, HumanMessage):
                    role = "user"
                elif isinstance(m, AIMessage):
                    role = "assistant"
                else:
                    continue
                
                additional = getattr(m, 'additional_kwargs', {}) or {}
                ts = additional.get('timestamp') or getattr(m, 'timestamp', None)
                
                # 处理多模态 content
                display_content = ""
                image_url = None
                
                if isinstance(m.content, list):
                    # 遍历多模态列表
                    for item in m.content:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                display_content += item.get("text", "")
                            elif item.get("type") == "image_url":
                                # 兼容不同的 image_url 嵌套格式
                                img_info = item.get("image_url")
                                if isinstance(img_info, dict):
                                    image_url = img_info.get("url")
                                else:
                                    image_url = img_info
                else:
                    display_content = str(m.content)

                # 如果 content 中包含 URL 但没设置 imageUrl，尝试自动提取
                if not image_url and display_content:
                    # 匹配常见的图片 URL 格式
                    url_match = re.search(r'(https?://[^\s<>"]+\.(?:jpg|jpeg|png|webp|gif|bmp))', display_content, re.I)
                    if not url_match:
                        # 兼容 aiproxy 等无后缀但包含 /output/ 的 URL
                        url_match = re.search(r'(https?://[^\s<>"]+/output/[^\s<>"]+)', display_content, re.I)
                    
                    if url_match:
                        image_url = url_match.group(1).strip('().,!=#?"')
                        print(f"[get_planner_history] 🔧 已从内容中获取图片 URL: {image_url[:40]}...")
                
                # 清洗正文：移除 [图片参考](...) 或 <!-- image_url: ... --> 等技术性链接，保持 UI 整洁
                if display_content:
                    display_content = re.sub(r'\[图片参考\]\(.*?\)', '', display_content)
                    display_content = re.sub(r'<!-- image_url: .*? -->', '', display_content)
                    display_content = display_content.strip()

                msg_data = {
                    "id": f"{role}_{ts or id(m)}_{i}", 
                    "role": role,
                    "content": display_content,
                    "imageUrl": image_url,
                    "timestamp": ts
                }
                
                if role == "assistant":
                    # 尝试解析结构化回复 (thought/action/reply)
                    try:
                        # 如果 content 本身就是 JSON 字符串
                        if display_content.strip().startswith("{") or "```json" in display_content:
                            parsed = _parse_planner_response(display_content)
                            if parsed:
                                msg_data["thought"] = parsed.get("thought", "")
                                msg_data["action"] = parsed.get("action")
                                msg_data["reply"] = parsed.get("reply", "")
                                msg_data["sourceIds"] = additional.get("results") or []
                                
                                # 解析 RAG 引用
                                if not msg_data.get("sourceIds"):
                                    source_tag = re.search(r'<!-- sources: (.*?) -->', display_content)
                                    if source_tag:
                                        ids = [i.strip() for i in source_tag.group(1).split(',') if i.strip()]
                                        msg_data["sourceIds"] = ids
                                    
                                    if not msg_data["sourceIds"]:
                                        found = re.findall(r'xhs_[a-zA-Z0-9_\-]+', display_content)
                                        ids = list(set(found))
                                        if ids:
                                            msg_data["sourceIds"] = ids
                    except Exception as e:
                        print(f"[get_planner_history] ❌ 解析 AI 消息详情失败: {e}")
                
                history.append(msg_data)
            except Exception as e:
                print(f"[get_planner_history] ⚠️ 跳过无法解析的消息 #{i}: {e}")
                continue
        
        print(f"[get_planner_history] ✅ 成功提取 {len(history)} 条消息 (会话: {conversation_id})")
        return history
        
    except Exception as e:
        print(f"[get_planner_history] ❌ get_state 失败: {e}")
        return []

async def clear_planner_history(conversation_id: str):
    """
    彻底清空对话历史。
    """
    planner_graph = await get_planner_graph()
    if planner_graph:
        config = {"configurable": {"thread_id": conversation_id}}
        await planner_graph.aupdate_state(config, {"messages": []})
        print(f"[Planner Memory] 🧹 已尝试重置 Thread: {conversation_id}")

async def delete_planner_session(conversation_id: str):
    """
    物理删除特定会话的所有数据（checkpoints 和 writes）。
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "data"))
    db_path = os.path.join(data_dir, "planner_checkpoints.db")
    
    if not os.path.exists(db_path):
        return

    try:
        async with aiosqlite.connect(db_path) as db:
            print(f"[Planner Memory] 🗑️ 正在物理删除 Thread: {conversation_id}")
            await db.execute("DELETE FROM checkpoints WHERE thread_id = ?", (conversation_id,))
            await db.execute("DELETE FROM writes WHERE thread_id = ?", (conversation_id,))
            await db.commit()
            print(f"[Planner Memory] ✅ 删除成功")
    except Exception as e:
        print(f"[Planner Memory] ❌ 删除会话失败: {e}")

async def get_all_sessions() -> List[dict]:
    """
    从数据库中提取所有已存在的会话列表。
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "..", "data"))
    db_path = os.path.join(data_dir, "planner_checkpoints.db")
    
    if not os.path.exists(db_path):
        return []

    sessions = []
    try:
        planner_graph = await get_planner_graph()
        async with aiosqlite.connect(db_path) as db:
            async with db.execute(
                "SELECT DISTINCT thread_id FROM checkpoints ORDER BY checkpoint_id DESC"
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    thread_id = row[0]
                    title = "新对话"
                    timestamp = None
                    try:
                        state = await planner_graph.aget_state({"configurable": {"thread_id": thread_id}})
                        messages = state.values.get("messages", [])
                        if messages:
                            # 逆序查找第一个 User 消息或第一个有效的 Assistant 消息作为标题
                            for m in messages:
                                content = str(m.content)
                                if not content or len(content.strip()) < 2:
                                    continue
                                
                                # 处理 JSON 格式指令，提取 reply
                                if "```json" in content:
                                    try:
                                        match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
                                        if match:
                                            js = json.loads(match.group(1))
                                            title = js.get("reply") or js.get("thought") or "指令对话"
                                        else:
                                            title = "复杂指令"
                                    except:
                                        title = "指令解析中"
                                else:
                                    # 普通文本，去除多余空白
                                    title = content.strip().split('\n')[0]
                                
                                if title:
                                    title = title[:30] + ("..." if len(title) > 30 else "")
                                    break
                            
                            checkpoint = state.metadata
                            if checkpoint and "ts" in checkpoint:
                                timestamp = checkpoint["ts"]
                    except:
                        pass
                    
                    sessions.append({
                        "id": thread_id,
                        "title": title,
                        "updated_at": timestamp
                    })
    except Exception as e:
        print(f"[Planner Memory] ❌ 获取会话列表失败: {e}")

    return sessions
