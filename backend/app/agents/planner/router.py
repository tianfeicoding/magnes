"""
Planner 核心 Agent 节点
不再承担巨无霸参数提取，已被降级为全路由专家架构的【极速分流关卡 Router Node】。
"""
import os
import re
import json
import asyncio
import copy
from typing import Annotated, Optional, TypedDict, Union, Any, List
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

from app.core.llm_config import get_llm_config
from .state import PlannerState
from .prompts import ROUTER_PROMPT
from .parser import _parse_planner_response
from app.core.template_utils import get_available_template_names, get_available_templates_metadata

def _extract_activity_content(messages: List[BaseMessage], include_skills: bool = False) -> str:
    """提取最详尽的活动原始信息 (Source-First 策略)"""
    # 关键词权重分配，地点和门票如果后面跟着内容，权重极高
    keywords = ["时间", "地点", "门票", "亮点", "价格", "时间：", "地点：", "门票：", "亮点："]
    
    candidates = []
    for i, msg in enumerate(messages):
        content_str = str(msg.content)
        if not content_str or len(content_str) < 10:
            continue
            
        # 排除掉正在执行的技能中间指令
        if not include_skills and "[技能指令]" in content_str:
            continue
            
        # 计算该条消息的“详情活跃度”
        match_count = sum(1 for kw in keywords if kw in content_str)
        # 如果不仅有“地点：”字样，且之后还有至少 2 个字的内容，加分
        detail_score = match_count * 10
        if re.search(r"地点[：:][^\n]{2,}", content_str):
            detail_score += 50
        if re.search(r"门票[：:][^\n]{2,}", content_str):
            detail_score += 30
            
        # 人类原始消息权重加成 (这是为了防止拿 AI 脱水后的摘要)
        if isinstance(msg, HumanMessage):
             detail_score += 100
             
        if detail_score > 20: # 必须具备一定的信息量
            candidates.append({
                "index": i,
                "score": detail_score,
                "content": content_str,
                "is_human": isinstance(msg, HumanMessage)
            })
            
    if not candidates:
        return str(messages[-1].content) if messages else ""
        
    # 排序：得分最高（最详细）优先，若得分相同则选较近的
    candidates.sort(key=lambda x: (x["score"], x["index"]), reverse=True)
    best_match = candidates[0]["content"]
    
    print(f"[Magnes Source Engine] 🔍 Selected best activity source (Score: {candidates[0]['score']}, Human: {candidates[0]['is_human']})", flush=True)
    return best_match

async def _check_fast_paths(last_msg: str, state: PlannerState) -> Optional[dict]:
    """处理强规则UI指令，提取模版提取等"""
    messages = state.get("messages", [])
    
    if any(kw in last_msg for kw in ["时间:", "地点:", "门票:", "时间：", "地点：", "门票："]) and len(last_msg) > 50:
        templates = await get_available_templates_metadata()
        reply_content = "✅ 已成功提取活动信息！\n\n请告诉我您想使用哪一个模版："
        mock_decision = {
            "thought": "检测到已知活动信息，直接选择模版。",
            "action": "chat",
            "is_fast_path": True,
            "parameters": {"content": last_msg}, 
            "reply": reply_content,
            "follow_up_reply": "请告诉我您想使用哪一个模版：",
            "templates": templates
        }
        return {"messages": [AIMessage(content=reply_content)], "final_decision": mock_decision}

    if "[技能指令] 确认选择模版:" in last_msg:
        id_match = re.search(r"\(ID: ([\w\-]+)\)", last_msg)
        use_emoji = "Emoji" in last_msg #  检测是否包含 Emoji 偏好关键词
        if id_match:
            template_id = id_match.group(1)
            # 优先从结构化状态中获取，无则扫描历史
            structured = state.get("structured_content", {})
            has_major_missing = any(not i.get('venue') for i in structured.get("items", [{}]))
            if structured and structured.get("items") and not has_major_missing:
                # 如果启用 Emoji，生成的内容也应包含图标（由 ParseHelpers 的增强版处理更好的兼容性）
                activity_content = "\n\n".join([f"{i.get('title','活动')}\n时间：{i.get('date','')}\n地点：{i.get('venue','')}\n亮点：{i.get('description','')}" for i in structured["items"]])
            else:
                activity_content = _extract_activity_content(messages, include_skills=False)
            reply_content = f"已为您选择模版，正在画布上生成编辑节点..."
            mock_decision = {
                "thought": f"用户选择了模版ID: {template_id}，触发生成节点。Emoji模式: {use_emoji}",
                "action": "create_rednote_node",
                "parameters": {"templateId": template_id, "content": activity_content, "useEmoji": use_emoji},
                "reply": reply_content
            }
            return {"messages": [AIMessage(content=reply_content)], "final_decision": mock_decision}

    if last_msg.strip().isdigit():
        choice_idx = int(last_msg.strip()) - 1
        templates = await get_available_templates_metadata()
        use_emoji = "Emoji" in last_msg # 数字选择同样检测上下文（通常来自上一轮对话，这里稍后需要更精准识别）
        if 0 <= choice_idx < len(templates):
            selected_tpl = templates[choice_idx]
            template_id = selected_tpl['id']
            # 优先从结构化状态中获取
            structured = state.get("structured_content", {})
            has_major_missing = any(not i.get('venue') for i in structured.get("items", [{}]))
            if structured and structured.get("items") and not has_major_missing:
                 activity_content = "\n\n".join([f"{i.get('title','活动')}\n时间：{i.get('date','')}\n地点：{i.get('venue','')}\n亮点：{i.get('description','')}" for i in structured["items"]])
            else:
                 activity_content = _extract_activity_content(messages[:-1], include_skills=True)
            reply_content = f"已为您选择【{selected_tpl['name']}】模版，正在画布上生成编辑节点..."
            mock_decision = {
                "thought": f"通过数字 {choice_idx+1} 选择模版",
                "action": "create_rednote_node",
                "parameters": {"templateId": template_id, "content": activity_content, "useEmoji": use_emoji},
                "reply": reply_content
            }
            return {"messages": [AIMessage(content=reply_content)], "final_decision": mock_decision}

    # 【视觉类技能指令强路由拦截】
    if "电商生图Skill" in last_msg:
         print(f"[Router Agent] ⚡️ 检测到 UI 指令按钮，强制分流至 Designer Expert", flush=True)
         mock_decision = {
            "thought": "用户点击了电商生图按钮，强制投递到设计师专家节点进行商品识别。",
            "action": "route_to_designer",
            "reply": "正在为您识别商品并准备生成方案..."
         }
         return {"final_decision": mock_decision}

    return None

async def call_model(state: PlannerState):
    """Router Agent 意图分发中枢。
    【全路由专家架构核心】：不再处理任何冗长的业务提示词拼装，只负责在极短时间内判定 action 并交由后置网关路由。
    """
    from app.rag import config
    base_url, api_key = await get_llm_config(is_layering=False)
    model_name = config.DEFAULT_PLANNER_MODEL
    print(f"[Router Agent] ⚡️ 极速分拣中心已启动, 模型: {model_name}", flush=True)

    messages = state.get("messages", [])
    last_msg = str(messages[-1].content) if messages else ""

    fast_decision = await _check_fast_paths(last_msg, state)
    if fast_decision:
        return fast_decision

    system_msg = ROUTER_PROMPT
    if state.get("active_skill"):
         system_msg += f"\n\n🚨当前处于专属技能流 ({state['active_skill']})，请优先识别技能相关意图。"
         
    cleaned_messages = []
    for i, m in enumerate(messages[-8:]):
        m_copy = m.__class__(content=m.content, **m.additional_kwargs)
        if isinstance(m_copy.content, list):
            m_copy.content = " ".join([p.get("text", "[UserImage]") for p in m_copy.content if isinstance(p, dict)])
        elif isinstance(m_copy.content, str):
            m_copy.content = re.sub(r'data:image/[^;]+;base64,[A-Za-z0-9+/=]{100,}', '[UserUploadedImage]', m_copy.content)
        cleaned_messages.append(m_copy)

    cleaned_messages.insert(0, SystemMessage(content=system_msg))
    
    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.0,
        timeout=30
    )
    
    try:
        response_obj = await llm.ainvoke(cleaned_messages)
        response_content = response_obj.content
        parsed = _parse_planner_response(response_content)
        if parsed and "reply" not in parsed:
            parsed["reply"] = "✅ 极速分拣已确认您的指令，正在处理中..."
        final_decision = parsed if parsed else {"action": "chat", "reply": response_content}
    except Exception as e:
        print(f"[Router Agent] 异常: {e}", flush=True)
        final_decision = {"action": "chat", "reply": "意图调度出错，请重试。"}

    VALID_ACTIONS = {
        "chat", "run_knowledge_agent", "run_painter", "run_copy_writing",
        "analyze_inspiration", "summary_draft", "run_refiner", "run_xhs_search",
        "run_xhs_publish", "create_rednote_node", "run_ingest_urls",
        "mirror_image", "export_canvas_image", "optimize_prompt", "save_prompt"
    }
    
    current_action = final_decision.get("action")
    if current_action not in VALID_ACTIONS:
        final_decision["action"] = "chat"
    
    if "reply" not in final_decision:
        final_decision["reply"] = ""
    
    update = {"final_decision": final_decision}
    print(f"[Router Agent] 🎯 极速裁决完成 -> Action: {final_decision.get('action')}", flush=True)
    return update
