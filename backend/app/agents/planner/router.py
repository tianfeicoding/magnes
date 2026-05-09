"""
Planner 核心 Agent 节点
不再承担巨无霸参数提取，已被降级为全路由专家架构的【极速分流关卡 Supervisor Node】。
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
from .skills import build_skill_prompt
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

def _format_structured_activity_content(structured: dict) -> Optional[str]:
    """把上游草稿/结构化结果转成输入内容节点使用的正文。"""
    items = (structured or {}).get("items") or []
    if not items:
        return None

    lines = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = str(item.get("title") or "").strip()
        date = str(item.get("date") or item.get("time") or "").strip()
        venue = str(item.get("venue") or item.get("subtitle") or item.get("location") or "").strip()
        price = str(item.get("price") or item.get("ticket") or "").strip()
        description = str(item.get("description") or item.get("desc") or "").strip()

        # 语义结构化超时时，CreativeAgent 会把完整草稿放在 description。
        if title == "活动合集草稿" and description:
            lines.append(description)
            continue

        block = []
        if title:
            block.append(title)
        if date:
            block.append(f"时间：{date}")
        if venue:
            block.append(f"地点：{venue}")
        if price:
            block.append(f"门票：{price}")
        if description:
            block.append(f"亮点：{description}")

        if block:
            lines.append("\n".join(block))

    content = "\n\n".join(lines).strip()
    return content or None

def _is_waiting_for_template_choice(messages: List[BaseMessage]) -> bool:
    """Return True only when a recent assistant turn actually offered templates."""
    for msg in reversed(messages[-8:-1]):
        if not isinstance(msg, AIMessage):
            continue

        content = str(msg.content or "")
        if not content:
            continue

        try:
            parsed = json.loads(content)
        except Exception:
            parsed = _parse_planner_response(content) if ("{" in content or "```json" in content) else None

        if isinstance(parsed, dict) and parsed.get("templates"):
            prompt_text = " ".join(
                str(parsed.get(field, ""))
                for field in ("reply", "follow_up_reply", "thought")
            )
            if any(kw in prompt_text for kw in ["选择", "模版", "模板", "编号"]):
                return True

        if "templates" in content and any(kw in content for kw in ["选择", "模版", "模板", "编号"]):
            return True

    return False

def _is_rednote_activity_skill_request(text: str) -> bool:
    """本地兜底识别已启用的“小红书活动合集”类工作流请求，避免卡在通用 LLM 分拣。"""
    normalized = (text or "").strip()
    if not normalized:
        return False

    has_rednote_context = any(kw in normalized for kw in ["小红书", "信息图", "灵感笔记", "灵感库"])
    has_activity_context = any(kw in normalized for kw in ["活动合集", "热门活动", "热门展览", "热门市集", "市集活动", "展览活动", "活动清单", "市集", "展览"])
    has_workflow_intent = any(kw in normalized for kw in ["做一组", "整理", "总结", "生成", "合集", "模版", "模板", "风格"])
    has_count_or_template = bool(re.search(r"(总结|整理)\s*[一二三四五六七八九十\d]+\s*个", normalized)) or any(kw in normalized for kw in ["模版", "模板", "风格"])
    return has_rednote_context and has_activity_context and has_workflow_intent and has_count_or_template

def _has_any(text: str, keywords: List[str]) -> bool:
    return any(keyword and str(keyword) in text for keyword in (keywords or []))

def _match_skill_rules(text: str, skill: dict) -> Optional[dict]:
    rules = skill.get("recall_rules") or {}
    negative = rules.get("negative_any") or []
    if _has_any(text, negative):
        return None

    must = rules.get("must_have_any") or []
    topic = rules.get("topic_any") or []
    action = rules.get("action_any") or []
    output = rules.get("output_any") or []

    if rules:
        has_must = not must or _has_any(text, must)
        has_topic = not topic or _has_any(text, topic)
        has_action = _has_any(text, action)
        has_output = _has_any(text, output)
        if has_must and has_topic and (has_action or has_output or (not action and not output)):
            score = sum([
                2 if has_must else 0,
                2 if has_topic else 0,
                1 if has_action else 0,
                1 if has_output else 0,
            ])
            return {"skill": skill, "score": score, "matched_by": "recall_rules"}
        return None

    keywords = skill.get("recall_keywords") or []
    score = sum(1 for keyword in keywords if keyword and str(keyword) in text)
    if score >= 2:
        return {"skill": skill, "score": score, "matched_by": "recall_keywords"}
    return None

def _infer_missing_slots(text: str, skill: dict) -> List[str]:
    required = skill.get("required_slots") or []
    missing = []
    for slot in required:
        slot_text = str(slot)
        if "城市" in slot_text or "区域" in slot_text:
            if not re.search(r"(上海|北京|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|浦东|徐汇|静安|黄浦|朝阳|海淀)", text):
                missing.append(slot_text)
        elif "时间" in slot_text:
            if not re.search(r"(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月|\d{1,2}月|五一|十一|本周|周末|今天|明天|暑假|寒假)", text):
                missing.append(slot_text)
        elif "主题" in slot_text:
            if not re.search(r"(活动|市集|展览|快闪|亲子|演出|艺术|咖啡|宠物|二次元|周末去哪)", text):
                missing.append(slot_text)
        elif "数量" in slot_text:
            if not re.search(r"[一二三四五六七八九十\d]+\s*个", text):
                missing.append(slot_text)
        elif "图片" in slot_text:
            if not any(kw in text for kw in ["上传", "图片", "图"]):
                missing.append(slot_text)
    return missing

async def _judge_skill_recall_with_llm(last_msg: str, candidates: List[dict]) -> Optional[dict]:
    if not candidates:
        return None
    try:
        from app.rag import config
        base_url, api_key = await get_llm_config(is_layering=False)
        llm = ChatOpenAI(
            model=config.DEFAULT_PLANNER_MODEL,
            api_key=api_key,
            base_url=base_url,
            temperature=0.0,
            timeout=12,
        )
        compact_candidates = []
        for item in candidates[:3]:
            skill = item["skill"]
            compact_candidates.append({
                "skill_id": skill.get("skill_id"),
                "name": skill.get("name"),
                "description": skill.get("description"),
                "usage_summary": (skill.get("usage_summary") or [])[:4],
                "risk_level": skill.get("risk_level"),
                "auto_run_policy": skill.get("auto_run_policy"),
                "matched_by": item.get("matched_by"),
                "rule_score": item.get("score"),
            })
        prompt = f"""你是 Magnes 的技能路由裁决器。判断用户输入是否应该使用候选技能。
只输出 JSON，不要输出解释文字。

用户输入:
{last_msg}

候选技能:
{json.dumps(compact_candidates, ensure_ascii=False)}

输出格式:
{{
  "selected_skill_id": "技能ID或空字符串",
  "decision": "none|recommend|activate",
  "confidence": 0.0,
  "activation_mode": "none|show_button|ask_missing_slots|auto_run",
  "reason": "一句话原因"
}}
"""
        response = await llm.ainvoke([SystemMessage(content=prompt)])
        parsed = _parse_planner_response(str(response.content))
        if isinstance(parsed, dict):
            return parsed
    except Exception as e:
        print(f"[Skill Recall] ⚠️ LLM 裁决失败，使用规则兜底: {e}", flush=True)
    return None

async def _recall_enabled_skill(last_msg: str, state: PlannerState) -> Optional[dict]:
    if state.get("active_skill"):
        return None

    normalized = (last_msg or "").strip()
    if not normalized:
        return None

    skill_index = (state.get("extra_context") or {}).get("skill_index") or []
    candidates = []
    for skill in skill_index:
        matched = _match_skill_rules(normalized, skill)
        if matched:
            candidates.append(matched)
    candidates.sort(key=lambda item: item["score"], reverse=True)
    if not candidates:
        return None

    judgement = await _judge_skill_recall_with_llm(normalized, candidates)
    best = candidates[0]["skill"]
    if judgement and judgement.get("selected_skill_id"):
        selected = next(
            (item["skill"] for item in candidates if item["skill"].get("skill_id") == judgement.get("selected_skill_id")),
            None,
        )
        if selected:
            best = selected

    decision = (judgement or {}).get("decision") or "activate"
    activation_mode = (judgement or {}).get("activation_mode") or "auto_run"
    confidence = float((judgement or {}).get("confidence") or min(0.95, 0.55 + candidates[0]["score"] * 0.1))
    policy = best.get("auto_run_policy") or "ask_if_missing"
    risk_level = best.get("risk_level") or "medium"
    missing_slots = _infer_missing_slots(normalized, best)

    if decision == "none" or confidence < 0.55:
        return None
    if risk_level == "high" or policy in {"confirm_before_run", "manual_only"}:
        activation_mode = "show_button"
    elif missing_slots:
        activation_mode = "ask_missing_slots"

    summary_parts = [
        best.get("name") or best.get("skill_id") or "",
        best.get("description") or "",
        "\n".join(str(item) for item in (best.get("usage_summary") or [])[:5]),
    ]
    print(
        f"[Skill Recall] 🧩 自动召回候选: {best.get('skill_id')} "
        f"mode={activation_mode} confidence={confidence:.2f} missing={missing_slots}",
        flush=True,
    )
    return {
        "active_skill": best.get("skill_id"),
        "skill_summary": "\n".join(part for part in summary_parts if part).strip(),
        "activation_mode": activation_mode,
        "confidence": confidence,
        "missing_slots": missing_slots,
        "skill_name": best.get("name") or best.get("skill_id"),
        "reason": (judgement or {}).get("reason") or f"命中 {candidates[0].get('matched_by')}，规则分={candidates[0].get('score')}",
    }

async def _check_fast_paths(last_msg: str, state: PlannerState) -> Optional[dict]:
    """处理强规则UI指令，提取模版提取等"""
    messages = state.get("messages", [])

    recalled_skill = await _recall_enabled_skill(last_msg, state)
    if recalled_skill:
        state["active_skill"] = recalled_skill["active_skill"]
        state["skill_summary"] = recalled_skill["skill_summary"]
        if recalled_skill.get("activation_mode") == "ask_missing_slots":
            missing = "、".join(recalled_skill.get("missing_slots") or [])
            reply = f"可以，我会使用「{recalled_skill.get('skill_name')}」。请补充：{missing}。"
            return {
                "messages": [AIMessage(content=reply)],
                "final_decision": {
                    "thought": "自动召回技能，但必要参数不足，先追问缺失字段。",
                    "action": "chat",
                    "reply": reply,
                    "skill_recall": recalled_skill,
                },
                "active_skill": recalled_skill["active_skill"],
                "skill_summary": recalled_skill["skill_summary"],
            }
        if recalled_skill.get("activation_mode") == "show_button":
            reply = f"检测到可用技能：「{recalled_skill.get('skill_name')}」。如需使用，请在我的技能或对话标签中手动确认。"
            return {
                "messages": [AIMessage(content=reply)],
                "final_decision": {
                    "thought": "自动召回到高风险或需确认技能，仅提示用户手动确认。",
                    "action": "chat",
                    "reply": reply,
                    "skill_recall": recalled_skill,
                },
            }

    if _is_rednote_activity_skill_request(last_msg):
        mock_decision = {
            "thought": "命中小红书活动合集工作流：先搜索小红书并入库，再用刚搜索到的笔记总结活动草稿，最后提供模版选择。",
            "action": "analyze_inspiration",
            "is_fast_path": True,
            "parameters": {"prompt": last_msg, "autoXhsSearch": True},
            "reply": "正在搜索小红书并整理活动合集草稿...",
            "skill_recall": recalled_skill,
        }
        return {"messages": [], "final_decision": mock_decision, **(recalled_skill or {})}
    
    if any(kw in last_msg for kw in ["时间:", "地点:", "门票:", "时间：", "地点：", "门票："]) and len(last_msg) > 50:
        templates = await get_available_templates_metadata()
        mock_decision = {
            "thought": "检测到已知活动信息，直接提取并进入草稿，不在此处生成回复语，交给 CreativeAgent 处理。",
            "action": "summary_draft",
            "is_fast_path": True,
            "parameters": {"content": last_msg},
            "reply": "",
            "follow_up_reply": "",
            "templates": templates
        }
        return {"messages": [], "final_decision": mock_decision}

    if "[技能指令] 确认选择模版:" in last_msg:
        id_match = re.search(r"\(ID: ([\w\-]+)\)", last_msg)
        use_emoji = "Emoji" in last_msg #  检测是否包含 Emoji 偏好关键词
        if id_match:
            template_id = id_match.group(1)
            # 优先从结构化状态中获取，无则扫描历史
            structured = state.get("structured_content", {})
            activity_content = _format_structured_activity_content(structured)
            if not activity_content:
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
        if not _is_waiting_for_template_choice(messages):
            return None
        choice_idx = int(last_msg.strip()) - 1
        templates = await get_available_templates_metadata()
        use_emoji = "Emoji" in last_msg # 数字选择同样检测上下文（通常来自上一轮对话，这里稍后需要更精准识别）
        if 0 <= choice_idx < len(templates):
            selected_tpl = templates[choice_idx]
            template_id = selected_tpl['id']
            # 优先从结构化状态中获取
            structured = state.get("structured_content", {})
            activity_content = _format_structured_activity_content(structured)
            if not activity_content:
                 activity_content = _extract_activity_content(messages[:-1], include_skills=True)
            reply_content = f"已为您选择【{selected_tpl['name']}】模版，正在画布上生成编辑节点..."
            mock_decision = {
                "thought": f"通过数字 {choice_idx+1} 选择模版",
                "action": "create_rednote_node",
                "parameters": {"templateId": template_id, "content": activity_content, "useEmoji": use_emoji},
                "reply": reply_content
            }
            return {"messages": [AIMessage(content=reply_content)], "final_decision": mock_decision}

    # 【视觉类技能强路由拦截】
    # 覆盖两条入口：先启用电商技能再上传图、先上传图再点击/回复使用电商技能。
    ecommerce_active = state.get("active_skill") == "ecommerce-image-gen"
    has_image_context = bool(state.get("active_image_url"))
    is_skill_command = str(last_msg or "").startswith("[技能指令]")
    is_upload_or_generate = any(kw in last_msg for kw in ["上传", "图片", "生图", "生成", "商品图", "使用技能"])
    if ecommerce_active and has_image_context and (is_skill_command or is_upload_or_generate):
        print(f"[Supervisor Agent] ⚡️ 检测到电商技能 + 图片上下文，强制分流至 Designer Expert", flush=True)
        mock_decision = {
            "thought": "电商生图技能已激活且存在商品图，强制投递到设计师专家节点。",
            "action": "route_to_designer",
            "reply": "正在为您识别商品并准备生成方案..."
        }
        return {"final_decision": mock_decision}

    # 【视觉类技能指令强路由拦截】
    if "电商生图Skill" in last_msg:
         print(f"[Supervisor Agent] ⚡️ 检测到 UI 指令按钮，强制分流至 Designer Expert", flush=True)
         mock_decision = {
            "thought": "用户点击了电商生图按钮，强制投递到设计师专家节点进行商品识别。",
            "action": "route_to_designer",
            "reply": "正在为您识别商品并准备生成方案..."
         }
         return {"final_decision": mock_decision}

    return None

async def call_model(state: PlannerState):
    """Supervisor Agent 意图分发中枢。
    【全路由专家架构核心】：不再处理任何冗长的业务提示词拼装，只负责在极短时间内判定 action 并交由后置网关路由。
    """
    from app.rag import config
    base_url, api_key = await get_llm_config(is_layering=False)
    model_name = config.DEFAULT_PLANNER_MODEL
    print(f"[Supervisor Agent] ⚡️ 极速分拣中心已启动, 模型: {model_name}", flush=True)

    messages = state.get("messages", [])
    last_msg = str(messages[-1].content) if messages else ""

    fast_decision = await _check_fast_paths(last_msg, state)
    if fast_decision:
        return fast_decision

    system_msg = ROUTER_PROMPT

    # 注入用户记忆摘要 (Soul.md + preferences)
    conversation_summary = state.get("conversation_summary", "")
    if conversation_summary:
        system_msg = f"[当前会话摘要]\n{conversation_summary}\n\n---\n\n" + system_msg

    memory_summary = state.get("memory_summary", "")
    if memory_summary:
        system_msg = f"[用户设定]\n{memory_summary}\n\n---\n\n" + system_msg

    if state.get("active_skill"):
         system_msg += build_skill_prompt(state["active_skill"], state.get("skill_summary"))
         
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
        print(f"[Supervisor Agent] 异常: {e}", flush=True)
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
    print(f"[Supervisor Agent] 🎯 极速裁决完成 -> Action: {final_decision.get('action')}", flush=True)
    return update
