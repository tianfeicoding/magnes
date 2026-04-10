"""
Designer Agent / Painter Expert
负责在 Router 判定用户涉及视觉生成、改图意图后，承接处理后续的参数提取与多轮对话。
包含画布生成提示词优化与金句收藏的核心业务逻辑。
"""
import json
import re
import asyncio
from typing import Optional, List
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, SystemMessage, BaseMessage, HumanMessage

from app.core.llm_config import get_llm_config
from app.agents.planner.state import PlannerState
from app.agents.planner.prompts import PAINTER_EXPERT_PROMPT, JSON_FORCED_INSTRUCTION
from app.agents.planner.parser import _parse_planner_response
from app.agents.planner.skills import detect_skill, build_skill_prompt

# ---------------- 工具函数执行区 ----------------
async def _execute_optimize_prompt(state: PlannerState, decision: dict):
    """提取自原 graph.py 的 optimize_prompt_node 逻辑"""
    params = decision.get("parameters", {})
    prompt_to_opt = params.get("prompt")
    
    if not prompt_to_opt:
        for msg in reversed(state.get("messages", [])):
            if isinstance(msg, HumanMessage):
                p = str(msg.content)
                if len(p) > 5 and not p.startswith("{"):
                    prompt_to_opt = p
                    break
    
    if not prompt_to_opt:
        reply = "⚠️ 未找到可优化的提示词。请先输入您的创作描述。"
        return {"final_decision": {**decision, "reply": reply}, "messages": [AIMessage(content=reply)]}
        
    from app.skills import prompt_optimizer
    from langchain_core.messages import HumanMessage as HubMsg

    system_prompt = prompt_optimizer.build_optimizer_prompt(current_model=params.get("target_model"))
    base_url, api_key = await get_llm_config(is_layering=False)
    llm = ChatOpenAI(base_url=base_url, api_key=api_key, model="gpt-4o", temperature=0.7)
    
    res = await llm.ainvoke([SystemMessage(content=system_prompt), HubMsg(content=f"优化此提示词片段：{prompt_to_opt}")])
    optimized = res.content.strip()
    
    next_action = "chat"
    if state.get("messages") and "继续生图" in str(state.get("messages")[-1].content):
         next_action = "run_painter"
         decision["action"] = "run_painter"
         decision.setdefault("parameters", {})["prompt"] = optimized
    
    reply = f"✨ **已为您完成提示词优化**：\n\n```\n{optimized}\n```"
    if next_action == "run_painter":
        reply += "\n\n🚀 正在为您触发 AI 生图..."
        
    message_content = json.dumps({"thought": decision.get("thought", ""), "action": decision.get("action"), "reply": reply, "prompt": optimized}, ensure_ascii=False)
    return {"final_decision": {**decision, "reply": reply, "prompt": optimized, "parameters": {**params, "prompt": optimized}}, "messages": [AIMessage(content=message_content)]}


async def _execute_save_prompt(state: PlannerState, decision: dict):
    """提取自原 graph.py 的 save_prompt_node 逻辑"""
    last_prompt = None
    last_img_url = None
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, AIMessage):
            try:
                data = json.loads(str(msg.content))
                if data.get("prompt"): last_prompt = data["prompt"]
                if data.get("image_url"): last_img_url = data["image_url"]
                if last_prompt: break
            except: continue
    
    if not last_prompt:
         reply = "⚠️ 未在近期对话中找到生图记录，无法收藏。"
         return {"final_decision": {**decision, "reply": reply}, "messages": [AIMessage(content=reply)]}
         
    from app.skills import prompt_optimizer
    prompt_optimizer.save_golden_prompt(last_prompt, last_img_url or "", source="chat_action")
    if last_img_url:
        asyncio.create_task(prompt_optimizer.trigger_visual_learning(last_img_url, last_prompt))
        
    reply = "✅ 已将提示词收藏至 Golden Prompt 数据库，系统已开始对此风格进行深度视觉学习。"
    message_content = json.dumps({"thought": "执行收藏提示词动作。", "action": "save_prompt", "reply": reply, "prompt_saved": True}, ensure_ascii=False)
    return {"final_decision": {**decision, "reply": reply, "prompt_saved": True}, "messages": [AIMessage(content=message_content)]}


def _recover_img_context(state: PlannerState, active_img: Optional[str]):
    recovered_var = None
    recovered_ratio = state.get("active_image_ratio")
    
    # 优先级 1: 检查显式的画布上下文 (由前端 ConversationPanel 同步)
    canvas_ctx = state.get("canvas_context")
    if canvas_ctx and "nodes" in canvas_ctx:
        for node in canvas_ctx["nodes"]:
            # 优先从 gen-image 或 input-image 节点恢复图片
            if node.get("type") in ["gen-image", "input-image", "rednote-content"]:
                # 检查 sourceImages 或 imageUrl
                imgs = node.get("sourceImages", [])
                if not imgs and node.get("imageUrl"):
                    imgs = [node.get("imageUrl")]
                
                if imgs and len(imgs) > 0:
                    val = imgs[0]
                    if val and "placeholder" not in str(val):
                        active_img = val
                        print(f"[Designer] 🖼️ 从画布节点 ({node.get('type')}) 恢复参考图: {str(active_img)[:50]}...", flush=True)
                        break

    if not active_img:
        for msg in reversed(state.get("messages", [])):
            if isinstance(msg, AIMessage):
                try:
                    json_data = json.loads(str(msg.content))
                    if json_data.get("action") == "run_painter":
                        params = json_data.get("parameters", {})
                        val = params.get("imageUrl")
                        if val and "magnes-studio.com" not in val and "placeholder" not in val and "[当前参考图片" not in val:
                            active_img = val
                            recovered_var = params.get("var")
                            recovered_ratio = params.get("ratio")
                            break
                except:
                    raw = str(msg.content)
                    urls = re.findall(r'https?://[^\s<>"]+', raw, re.I)
                    if urls:
                        active_img = urls[-1].strip('().,!=#?"')
                        v_match = re.search(r'var[:\s]+(\d\.\d+)', raw, re.I)
                        if v_match: recovered_var = float(v_match.group(1))
                        break
            if active_img: break
    return active_img, recovered_var, recovered_ratio

# ---------------- 中枢执行节点 ----------------
async def call_designer_model(state: PlannerState):
    """画布生成大脑节点"""
    decision = state.get("final_decision", {})
    action = decision.get("action")
    
    # 纯工具拦截优先
    if action == "optimize_prompt":
        return await _execute_optimize_prompt(state, decision)
    if action == "save_prompt":
        return await _execute_save_prompt(state, decision)
        
    # 其余为 LLM 思维生成流
    from app.rag import config
    base_url, api_key = await get_llm_config(is_layering=False)
    model_name = config.DEFAULT_PLANNER_MODEL
    
    messages = state.get("messages", [])
    last_msg = str(messages[-1].content) if messages else ""
    active_img, rec_var, rec_ratio = _recover_img_context(state, state.get("active_image_url"))
    
    system_msg = PAINTER_EXPERT_PROMPT
    current_active_skill = detect_skill(last_msg, state.get("active_skill"), has_image_context=bool(active_img))
    if current_active_skill:
        system_msg += build_skill_prompt(current_active_skill, state.get("skill_summary"), active_img)
        if current_active_skill == "ecommerce-image-gen":
            system_msg += "\n\n[⚠️ 电商识别强制令 ⚠️]:\n1. 跳过询问。\n2. 强制执行 run_painter。"
            
    if active_img:
        system_msg += f"\n\n【当前上下文参考图】: {'[Base64 Hidden]' if len(active_img) > 1000 else active_img}"
        if rec_var: system_msg += f"\n【建议重绘强度 var】: {rec_var}"
        system_msg += f"\n🚨 务必在 parameters.imageUrl 填入参考图地址：{active_img if len(active_img)<1000 else 'REUSE_CONTEXT_IMAGE'}"

    # 注入全局 JSON 约束
    system_msg += JSON_FORCED_INSTRUCTION

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.2,
        timeout=60
    )
    
    cleaned_messages = [SystemMessage(content=system_msg)] + messages[-10:]
    response_obj = await llm.ainvoke(cleaned_messages)
    content = response_obj.content
    
    parsed = _parse_planner_response(content)
    if parsed and "reply" not in parsed:
        parsed["reply"] = "✅ 收到指令，正在为您执行..."
    final_decision = parsed if parsed else {"action": action or "run_painter", "reply": content}
    
    if final_decision.get("action") not in ["run_painter", "mirror_image", "optimize_prompt", "save_prompt", "export_canvas_image"]:
        final_decision["action"] = action or "run_painter"

    # 若探测到电商技能，强制锁定为 run_painter
    if current_active_skill == "ecommerce-image-gen":
        final_decision["action"] = "run_painter"
        
    if final_decision.get("action") == "run_painter":
        params = final_decision.setdefault("parameters", {})
        if active_img and not params.get("imageUrl"): params["imageUrl"] = active_img
        if params.get("imageUrl") == "REUSE_CONTEXT_IMAGE" and active_img: params["imageUrl"] = active_img
        if rec_var and not params.get("var"): params["var"] = rec_var
        if rec_ratio and not params.get("ratio"): params["ratio"] = rec_ratio
    
    update = {"messages": [AIMessage(content=content)], "final_decision": final_decision}
    if current_active_skill: update["active_skill"] = current_active_skill
    if final_decision.get("skill_summary"): update["skill_summary"] = final_decision["skill_summary"]
    
    return update
