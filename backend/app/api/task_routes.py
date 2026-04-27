"""
Task API Routes
负责异步 AI 任务的分发与状态查询。
1. /run: 接收生成请求，启动后台任务（图像生成、分层、重绘）。
2. /{task_id}: 允许前端轮询任务的具体执行进度与结果内容。
核心逻辑涉及 BackgroundTasks 的使用，确保不阻塞主接口响应。
"""
# backend/app/api/task_routes.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import uuid
import asyncio
import json

from app.core import prompts
from app.core.database import get_db
from app.core.users import current_user
from app.models import GenerationHistory
from app.models.user import User
from app.tools.painting_tool import call_image_generate
from app.tools.visual_analyzer import analyze_visual_style # 假设存在此工具
from app.core.storage_utils import download_and_persist_image
from app.agents.experts.visual_critic import critic_manager # 导入评价员
from app.agents.experts.style_analyzer import style_analyzer_node
from app.core.workflow import create_workflow
from app.schema.state import MagnesState

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"]
)

async def run_ai_task_background(task_id: str, data: dict, db_session_factory):
    """后台执行 AI 任务并更新数据库"""
    task_type = data.get("type", "image")
    print(f"DEBUG: Background task {task_id} started. Type: {task_type}")
    async with db_session_factory() as db:
        try:
            task_type = data.get("type", "image")
            prompt = data.get("prompt")
            source_images = data.get("sourceImages", [])
            # 过滤空字符串或无效图源
            source_images = [img for img in source_images if img and str(img).strip()]
            
            model_id = data.get("options", {}).get("model")
            options = data.get("options", {})
            conversation_id = options.get("conversationId")

            print(f"DEBUG: [Task Background] {task_id} Processing. Images: {len(source_images)}, Conv: {conversation_id}")

            # [RESCUE LOGIC] 服务端图源自动补齐 (Bulletproof Defense)
            # 仅在既没有参考图，又没有提示词的情况下才尝试补齐（防止干扰纯文生图）
            if not source_images and task_type == "image" and not str(prompt or "").strip():
                print(f"[Task Background] 🚨 Warning: No images received from frontend. Attempting DB Rescue...")
                # 尝试从历史记录中找回该会话最后一次成功的图片（通常是用户上传的商品图）
                try:
                    query = select(GenerationHistory).filter(
                        GenerationHistory.status == "completed",
                        GenerationHistory.url.isnot(None)
                    ).order_by(GenerationHistory.created_at.desc())
                    
                    # 如果有会话 ID，则优先筛选该会话
                    if conversation_id:
                        # 假设未来 metadata_info 中存有 conversationId，或者直接按 Prompt 匹配
                        # 暂时按全局最后一张图片兜底（最鲁棒）
                        pass

                    rescue_result = await db.execute(query.limit(3))
                    candidates = rescue_result.scalars().all()
                    if candidates:
                        # 找出一张看起来像原始图或由 Input 节点产生的图
                        rescued_url = candidates[0].url
                        source_images = [rescued_url]
                        print(f"[Task Background] ✅ Rescue Successful! Found latest image: {rescued_url}")
                    else:
                        print(f"[Task Background] ❌ Rescue failed: No history found.")
                except Exception as rescue_err:
                    print(f"[Task Background] ❌ Rescue failed: {rescue_err}")

            result_url = None
            result_content = None

            if task_type == "image":
                options = data.get("options", {})
                image_size_param = options.get("image_size", "4K")
                active_skill = options.get("active_skill")
                
                # [比例修复] ratio -> size 映射
                RATIO_SIZE_MAP = {
                    "1:1":  "1024x1024",
                    "3:4":  "768x1024",
                    "4:3":  "1024x768",
                    "9:16": "576x1024",
                    "16:9": "1024x576",
                }
                ratio = options.get("ratio", "1:1")
                image_res = RATIO_SIZE_MAP.get(ratio, "1024x1024")
                print(f"[Task Background] 📐 比例与大小映射: ratio={ratio} -> res={image_res}, size={image_size_param}")
                
                feedback = options.get("feedback")
                final_prompt = prompt

                # [反馈回路] 如果存在反馈指令，先进行 Prompt 增强
                if feedback and isinstance(feedback, dict):
                    action_id = feedback.get("feedbackAction")
                    label = feedback.get("feedbackLabel")
                    print(f"[Task Background] 🔁 Feedback Detected: {action_id} ({label})")
                    
                    if action_id == "auto_lab" and critic_manager:
                        # 一键实验室：调用 VisualCritic 进行深度诊断并自动优化
                        if source_images:
                            print(f"[Task Background] 🧪 Running Auto-Lab (VisualCritic)...")
                            critic_report = await critic_manager.audit_image(source_images[0], prompt)
                            if critic_report.get("status") == "success":
                                # 使用评价员给出的优化建议作为新 Prompt
                                final_prompt = critic_report.get("optimized_prompt", prompt)
                                print(f"[Task Background] ✨ Auto-Lab Optimized Prompt: {final_prompt[:100]}...")
                    elif action_id != "undo":
                        # 普通指令增强 (追加风格/微调构图等)
                        try:
                            from app.agents.designer_agent import get_llm_config
                            from langchain_core.messages import SystemMessage
                            from langchain_openai import ChatOpenAI
                            
                            base_url, api_key = await get_llm_config()
                            llm = ChatOpenAI(model="gpt-4o", api_key=api_key, base_url=base_url)
                            
                            refine_sys = f"你是一个提示词微调专家。用户当前描述是: '{prompt}'。用户点击了 '{label}' 按钮。请输出一个增强后的英文提示词，重点强化用户要求的 {label} 方面。直接输出结果，不要包含解释。"
                            refine_res = await llm.ainvoke([SystemMessage(content=refine_sys)])
                            final_prompt = refine_res.content
                            print(f"[Task Background] 🎨 Feedback Refined Prompt: {final_prompt[:100]}...")
                        except Exception as refine_err:
                            print(f"[Task Background] ⚠️ Prompt Refine failed, using original: {refine_err}")
                # 为图片生成不再重复注入业务技能约束，防止 Prompt 产生杂讯 (已在 Planner 中提前优化)

                # 工具类内部已有详细日志
                print(f"DEBUG: [Task Background] Calling call_image_generate with {len(source_images)} images.")
                result_url = await call_image_generate(
                    final_prompt,
                    size=image_res,      # [比例修复] 传递映射后的尺寸
                    image_size=image_size_param, # 传递 1K/2K/4K 大小参数
                    model=model_id,
                    image_urls=source_images, # 传递完整图层合集
                    db=db
                )
                if result_url:
                    print(f"[Painting Tool] 🎉 Image generation successful: {result_url}")
                    # [持久化修复] 将外链图片下载到本地
                    local_url = await download_and_persist_image(result_url)
                    if local_url:
                        print(f"[Task Background] 💾 Persisted to: {local_url}")
                        result_url = local_url
                else:
                    print(f"[Painting Tool] ❌ Image generation failed for task {task_id}")
            elif task_type == "refine":
                options = data.get("options", {})
                active_skill = options.get("active_skill")

                # 后端数据源驱动策略 (Data Source Enforcement)
                # refine 任务被复用于“视觉分析”和“语义分析”两类业务。
                # 由于“语义分析”需要前端动态传入图层数据（JSON），我们仅拦截并覆盖“视觉分析”类的请求。
                final_prompt = prompt
                prompt_str = str(prompt).lower()
                
                # 识别视觉分析请求的关键词
                modeling_keywords = ["视觉分析", "平面设计", "风格模型", "分析这款海报"]
                is_modeling_req = not prompt or any(kw in prompt_str for kw in modeling_keywords)
                
                # 专门识别语义分析请求的关键词 (强特征)
                semantic_keywords = ["语义", "角色", "提取", "semantic", "role", "layers", "parts", "structured"]
                is_semantic_req = any(kw in prompt_str for kw in semantic_keywords)
                
                if is_modeling_req and not is_semantic_req:
                    final_prompt = prompts.TEMPLATE_REFINER["main"]
                    print(f"[Task Background] 🛡️ Backend Data Source: Overriding to latest Refiner Prompt")

                # 为视觉分析注入业务技能约束
                if active_skill:
                    from app.core.skills_loader import loader as skill_loader
                    business_instruction = skill_loader.get_skill_instruction(active_skill)
                    if business_instruction:
                        print(f"[Task Background] 🚀 Injecting Skill [{active_skill}] into Refine Prompt")
                        final_prompt = f"{final_prompt}\n\n## 🚨 HIGH-PRIORITY BUSINESS GUIDELINES (Skill: {active_skill})\n{business_instruction}"
                
                result = await analyze_visual_style(final_prompt, source_images, model=model_id, db=db)
                if result.get("status") == "success":
                    result_content = result.get("content")
                    print(f"[Visual Analyzer] 🎉 Refinement successful for task {task_id}")
                else:
                    error_msg = result.get("message", "Unknown Error")
                    print(f"[Visual Analyzer] ❌ Refinement failed for task {task_id}: {error_msg}")
                    # 主动抛出异常以便进入 catch 块更新 DB 状态
                    raise Exception(f"Refinement Failed: {error_msg}")
            elif task_type == "split":
                # 布局拆分节点也强制使用后端数据源
                final_prompt = prompts.REGION_DETECTION["main"]
            elif task_type == "layout_analyze":
                print(f"[Task Background] 🧩 Running Layout Analyzer for task {task_id}")

                # 与 Refiner 一致的调用方式
                final_prompt = prompts.LAYOUT_ANALYZER["main"]
                print(f"[Task Background] 🛡️ Backend Data Source: Using LAYOUT_ANALYZER prompt")

                # 业务技能注入
                active_skill = data.get("options", {}).get("active_skill")
                if active_skill:
                    from app.core.skills_loader import loader as skill_loader
                    business_instruction = skill_loader.get_skill_instruction(active_skill)
                    if business_instruction:
                        print(f"[Task Background] 🚀 Injecting Skill [{active_skill}] into Layout Analyzer Prompt")
                        final_prompt = f"{final_prompt}\n\n## 🚨 HIGH-PRIORITY BUSINESS GUIDELINES (Skill: {active_skill})\n{business_instruction}"

                result = await analyze_visual_style(final_prompt, source_images, model=model_id, db=db)
                if result.get("status") == "success":
                    result_content = result.get("content")
                    print(f"[Layout Analyzer] 🎉 Layout analysis successful for task {task_id}")
                else:
                    error_msg = result.get("message", "Unknown Error")
                    print(f"[Layout Analyzer] ❌ Layout analysis failed for task {task_id}: {error_msg}")
                    raise Exception(f"Layout Analysis Failed: {error_msg}")
            elif task_type == "style_analyze":
                print(f"[Task Background] 🎨 Running Style Analyzer for task {task_id}")
                state = MagnesState(intent={"image_url": source_images[0]})
                res = await style_analyzer_node(state)
                result_content = json.dumps({
                    "style_learning": res.get("style_learning"),
                    "style_prompt": res.get("style_prompt"),
                    "style_genome": res.get("style_genome"),
                    "background_color": res.get("background_color")
                })

                # print(f"[Task Background] �️ Magnes Standard: Overriding to latest Backend Splitter Prompt")

                # from app.tools.visual_analyzer import call_qwen_image_layered, transform_to_magnes_schema
                # raw_result = await call_qwen_image_layered(source_images[0], prompt=final_prompt, db=db)
                # magnes_result = transform_to_magnes_schema(raw_result)
                # result_content = json.dumps(magnes_result)
                # if magnes_result:
                #     print(f"[Visual Analyzer] 🎉 Split successful for task {task_id}")
                # else:
                #     print(f"[Visual Analyzer] ❌ Split failed for task {task_id}")
            elif task_type == "style_evolve":
                print(f"[Task Background] 🔄 Running Style Evolution for task {task_id}")
                app = await create_workflow()

                options = data.get("options", {})
                # V1.0: 支持验证模式（生图+评分）或纯优化模式
                enable_validation = options.get("enable_validation", False)
                # 评分模式：clone（还原度）或 evolution（创作质量）
                evaluation_mode = options.get("evaluation_mode", "evolution")

                print(f"[Task Background] Validation mode: {enable_validation}, Evaluation mode: {evaluation_mode}")

                # 再优化时传递已有的版本历史
                existing_evolution = options.get("style_evolution") or []
                print(f"[Task Background] 接收到的版本历史: {len(existing_evolution)} 条")

                # 从历史版本中提取最新的 critic_report 用于反馈优化
                latest_critic_report = None
                if existing_evolution:
                    # 查找最后一个有 critic_report 的版本
                    for entry in reversed(existing_evolution):
                        if entry.get("critic_report"):
                            latest_critic_report = entry["critic_report"]
                            print(f"[Task Background] 找到历史评分报告: score={latest_critic_report.get('score')}")
                            break

                initial_state = MagnesState(
                    messages=[],
                    instruction=options.get("current_prompt") or prompt or "",
                    user_prompt=options.get("current_prompt") or prompt or "",
                    style_prompt=options.get("current_prompt") or prompt or "",
                    intent={
                        "image_url": source_images[0] if source_images else None,
                        "evolution_strategy": options.get("evolution_strategy", "evolve")
                    },
                    run_style_evolve=True,
                    run_painter=enable_validation,      # V1.0: 验证模式才生图
                    run_style_critic=enable_validation, # V1.0: 验证模式才评分
                    evaluation_mode=evaluation_mode,    # V1.0: 评分模式
                    evolution_count=0,
                    style_evolution=existing_evolution,  # 使用传入的版本历史
                    critic_report=latest_critic_report,  # 传递最新的评分报告用于反馈优化
                    visual_assets=source_images or [],
                    current_step="init",
                    is_completed=False
                )

                # 执行工作流
                final_state = await app.ainvoke(
                    initial_state,
                    config={"configurable": {"thread_id": task_id}}
                )

                # V1.0: 根据模式组装返回结果
                final_evolution = final_state.get("style_evolution", [])
                print(f"[Task Background] 最终 style_evolution 长度: {len(final_evolution)}")
                print(f"[Task Background] 最终 style_evolution 版本列表: {[e.get('version') for e in final_evolution]}")
                # [DEBUG] 打印每个版本的简要信息
                for idx, e in enumerate(final_evolution):
                    print(f"[Task Background] V{e.get('version')}: strategy={e.get('strategy')}, has_generated_image={bool(e.get('generated_image'))}, prompt_len={len(str(e.get('prompt', '')))}")
                # 只截断图片base64，保留其他所有内容
                evolution_log = []
                for e in final_evolution:
                    entry = dict(e)
                    # 只处理 source_image (可能包含base64)
                    if entry.get("source_image"):
                        img_str = str(entry["source_image"])
                        if len(img_str) > 100:
                            entry["source_image"] = f"{img_str[:50]}...[truncated {len(img_str)-100} chars]...{img_str[-50:]}"
                    # 只处理 generated_image (可能包含base64)
                    if entry.get("generated_image"):
                        img_str = str(entry["generated_image"])
                        if len(img_str) > 100:
                            entry["generated_image"] = f"{img_str[:50]}...[truncated {len(img_str)-100} chars]...{img_str[-50:]}"
                    evolution_log.append(entry)
                # 安全打印：确保不会输出过长的内容
                try:
                    log_str = str(evolution_log)
                    if len(log_str) > 2000:
                        print(f"[Task Background] 最终 style_evolution 详细内容被截断，长度: {len(log_str)}")
                    else:
                        print(f"[Task Background] 最终 style_evolution 详细内容: {log_str}")
                except Exception as e:
                    print(f"[Task Background] 最终 style_evolution 详细内容: [无法打印: {e}]")
                # 在返回前，确保 generated_image 和 critic_report 保存到 style_evolution
                evolved_version = final_state.get("evolved_version")
                generated_image_url = final_state.get("background_url")
                critic_report_data = final_state.get("critic_report")
                print(f"[Task Background] [DEBUG] evolved_version={evolved_version}, has_generated_image={bool(generated_image_url)}, has_critic_report={bool(critic_report_data)}")
                if evolved_version is not None and generated_image_url:
                    for entry in final_evolution:
                        if entry.get("version") == evolved_version:
                            entry["generated_image"] = generated_image_url
                            if critic_report_data:
                                entry["critic_report"] = critic_report_data
                            print(f"[Task Background] 已手动将 V{evolved_version} 的 generated_image 和 critic_report 关联到 style_evolution")
                            break
                else:
                    print(f"[Task Background] [DEBUG] 跳过修复: evolved_version={evolved_version}, generated_image_url={generated_image_url is not None}")

                result_data = {
                    "style_prompt": final_state.get("style_prompt"),
                    "style_evolution": final_evolution
                }
                # [DEBUG] 确认返回的数据
                print(f"[Task Background] result_data style_evolution length: {len(result_data.get('style_evolution', []))}")
                print(f"[Task Background] result_data versions: {[e.get('version') for e in result_data.get('style_evolution', [])]}")

                # 验证模式额外返回生成图和评分
                if enable_validation:
                    critic_report = final_state.get("critic_report")
                    result_data.update({
                        "generated_image": final_state.get("background_url"),
                        "critic_report": critic_report,
                        "validation_mode": True,
                        "create_validator_node": True,  # V1.0: 标记前端创建验证节点
                        "source_image": source_images[0] if source_images else None  # V1.0: 原图URL
                    })
                    print(f"[Task Background] ✅ Validation completed. Score: {critic_report.get('score') if critic_report else 'N/A'}, Mode: {critic_report.get('evaluation_mode') if critic_report else 'N/A'}")
                    # 截断 critic_report 日志，避免过长的输出
                    critic_log = str(critic_report)
                    if len(critic_log) > 500:
                        critic_log = f"{critic_log[:200]}...[truncated {len(critic_log)-400} chars]...{critic_log[-200:]}"
                    print(f"[Task Background] 📊 Full critic_report: {critic_log}")
                else:
                    print(f"[Task Background] ✅ Prompt optimization completed. Versions: {len(final_state.get('style_evolution', []))}")

                result_content = json.dumps(result_data)

            print(f"[Task Background] Task {task_id} complete. Updating status...")
            # 更新任务状态为已完成
            existing = await db.get(GenerationHistory, task_id)
            if existing:
                existing.status = "completed"
                existing.url = result_url
                existing.content = result_content
                existing.progress = 100
                await db.commit()

            # 异步记忆回填：如果任务带了 conversationId，将结果反向注入对话历史
            options = data.get("options", {})
            planner_thread_id = options.get("plannerThreadId") or options.get("conversationId")
            if planner_thread_id and (result_url or result_content):
                from app.agents.planner import add_planner_history
                # 构造一条 AI 的自我确认消息供后续回溯
                if task_type == "image" and result_url:
                    # 向对话历史回填一条友好的完成消息（含图片）
                    # 注意：前端 use-generation-service.js 已移除冗余持久化，此处是唯一写入源
                    memo = "✅ 创作已完成：新图已存入生图库。"
                    await add_planner_history(planner_thread_id, memo, image_url=result_url)
                elif result_content:
                    await add_planner_history(planner_thread_id, f"任务分析完成：{str(result_content)[:200]}...")

        except Exception as e:
            print(f"[Task Background] Error in background task {task_id}: {e}")
            existing = await db.get(GenerationHistory, task_id)
            if existing:
                existing.status = "failed"
                existing.error_msg = str(e)
                await db.commit()

@router.post("/run")
async def run_task(
    data: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user)
):
    """启动异步 AI 任务"""
    print(f"DEBUG: [Task Routes] Received request: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}...")
    task_id = str(uuid.uuid4())
    
    # 增强后端鲁棒性：全量挽救嵌套参数
    # 解决 sqlite3.InterfaceError 并防止嵌套对象导致的数据丢失（如 sourceImages）
    raw_prompt = data.get("prompt")
    if isinstance(raw_prompt, dict):
        print(f"WARNING: [Task Routes] Received prompt as dict. Merging nested fields...")
        # 1. 挽救嵌套的 prompt 字符串
        extracted_prompt = raw_prompt.get("prompt") or raw_prompt.get("text") or raw_prompt.get("content")
        prompt_str = str(extracted_prompt) if extracted_prompt is not None else json.dumps(raw_prompt, ensure_ascii=False)
        
        # 2. 挽救其它可能被意外嵌套的顶级字段 (解决 sourceImages 丢失)
        for field in ["type", "sourceImages", "nodeId", "options"]:
            if field in raw_prompt and (not data.get(field) or data.get(field) == []):
                data[field] = raw_prompt[field]
                print(f"  - Salvaged '{field}' from nested prompt object.")
    else:
        prompt_str = str(raw_prompt) if raw_prompt is not None else ""

    # 1. 在历史表中创建 PENDING 记录
    new_task = GenerationHistory(
        id=task_id,
        type=data.get("type", "image"),
        status="generating",
        prompt=prompt_str,
        model_name=data.get("options", {}).get("model"),
        progress=5,
        source_node_id=data.get("nodeId")
    )
    db.add(new_task)
    await db.commit()

    # 强制同步打印，确认路由入口
    print(f"\n[Task Routes] >>> NEW TASK RECEIVED <<<")
    print(f"   - Task ID: {task_id}")
    print(f"   - Type: {data.get('type')}")
    print(f"   - NodeID: {data.get('nodeId')}")
    
    # 2. 启动后台任务 (Hamilton Fix: 同步清洗下发载荷)
    data["prompt"] = prompt_str
    options = data.setdefault("options", {})
    if isinstance(options, dict) and options.get("conversationId"):
        from app.agents.planner import make_user_thread_id
        options["plannerThreadId"] = make_user_thread_id(user.id, options["conversationId"])
    from app.core.database import AsyncSessionLocal
    background_tasks.add_task(run_ai_task_background, task_id, data, AsyncSessionLocal)
    
    print(f"[Task Routes] <<< ASYNC TASK DISPATCHED >>>\n")

    return {"status": "success", "task_id": task_id}

@router.get("/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    """查询任务状态"""
    task = await db.get(GenerationHistory, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.to_dict()

@router.get("/test-style-evolve")
async def test_style_evolve():
    """测试 style_evolve 返回格式"""
    return {
        "style_prompt": "测试提示词",
        "style_evolution": [
            {
                "version": 0,
                "strategy": "extract",
                "prompt": "原始提示词",
                "changes": ["原始提取"]
            },
            {
                "version": 1,
                "strategy": "evolve",
                "prompt": "优化后提示词",
                "changes": ["AI进化"],
                "generated_image": "http://example.com/test.jpg"
            }
        ],
        "generated_image": "http://example.com/test.jpg",
        "critic_report": {
            "score": 85,
            "judgement": "测试评分",
            "evaluation_mode": "clone"
        },
        "validation_mode": True
    }

@router.post("/debug-echo")
async def debug_echo(data: dict):
    """调试端点：回显接收到的数据"""
    # 截断打印，避免输出过长的base64图片
    data_log = str(data)[:500] + "..." if data and len(str(data)) > 500 else data
    print(f"[DEBUG] 接收到的数据: {data_log}")
    return {
        "received": data,
        "style_evolution_length": len(data.get("options", {}).get("style_evolution", []))
    }
