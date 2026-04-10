"""
Planner Tool Executor
负责在专家节点产出 Action 决策后，执行物理工具调用（如生图、搜索、文案生成等）。
作为“大脑”专家后的“肢体”执行层。
"""
import json
from langchain_core.messages import AIMessage
from .state import PlannerState

def map_ratio_to_size(ratio: str, image_url: str = None) -> str:
    if not ratio: return "1024x1024"
    if ratio == "auto" and image_url:
        import os
        from PIL import Image
        local_path = None
        
        # 兼容相对路径和带域名的全路径
        if "/skills_assets/" in image_url:
            sub = image_url.split("/skills_assets/")[-1]
            local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".agent", sub))
        elif "/uploads/" in image_url:
            sub = image_url.split("/uploads/")[-1]
            local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "uploads", sub))
        elif "/api/v1/rag/images/gallery/" in image_url:
            sub = image_url.split("/")[-1]
            local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "rag_images", "gallery", sub))
        elif "/api/v1/rag/images/xhs/" in image_url:
            sub = image_url.split("/")[-1]
            local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "rag_images", "xhs", sub))
            
        if local_path and os.path.exists(local_path):
            try:
                with Image.open(local_path) as img:
                    w, h = img.size
                    r = w / h
                    if 0.95 <= r <= 1.05: return "1024x1024"
                    if 0.7 <= r <= 0.8: return "768x1024" 
                    if 1.25 <= r <= 1.4: return "1024x768" 
                    if 0.5 <= r <= 0.6: return "576x1024" 
                    if 1.6 <= r <= 1.88: return "1024x576" 
                    if 0.6 <= r < 0.7: return "832x1216"
                    if 1.4 < r < 1.6: return "1216x832"
                    
                    if w > h:
                        return f"1024x{int(1024/r)}"
                    else:
                        return f"{int(1024*r)}x1024"
            except Exception as e:
                print(f"[Executor] ⚠️ Failed to auto-detect ratio for {local_path}: {e}")
                
    mapping = {
        "1:1": "1024x1024",
        "3:4": "768x1024",
        "4:3": "1024x768",
        "9:16": "576x1024",
        "16:9": "1024x576",
        "2:3": "832x1216",
        "3:2": "1216x832",
        "auto": "1024x1024" # 兜底
    }
    return mapping.get(ratio, "1024x1024")

async def executor_agent(state: PlannerState):
    """通用工具执行节点"""
    decision = state.get("final_decision", {})
    action = decision.get("action")
    params = decision.get("parameters", {})
    
    print(f"[Executor] 📥 Decision Received: action={action}, params_keys={list(params.keys())}", flush=True)
    if action == "run_painter":
        print(f"[Executor] 🎨 正在启动 AI 绘图任务 (Painter)... Prompt: {str(params.get('prompt', 'MISSING'))[:50]}...", flush=True)
        from app.tools.painting_tool import call_image_generate
        from app.core.database import AsyncSessionLocal
        
        prompt = params.get("prompt")
        model = params.get("model") or "nano-banana"
        # 兼容性处理：优先使用 parameters 里的，否则回退到上下文
        image_url = params.get("imageUrl") or params.get("image_url") or state.get("active_image_url")
        image_urls_param = params.get("image_urls", [])
        
        ratio = params.get("ratio") or state.get("active_image_ratio") or "1:1"
        target_size = map_ratio_to_size(ratio, image_url=image_url)
        params["ratio"] = ratio
        
        # 执行物理生图 API 调用 (注入 DB 以便读取自定义 Key/URL)
        async with AsyncSessionLocal() as db:
            bg_url = await call_image_generate(
                prompt=prompt,
                model=model,
                size=target_size,
                image_url=image_url,
                image_urls=image_urls_param if isinstance(image_urls_param, list) else None,
                db=db
            )
        
        if bg_url:
            orig_reply = decision.get("reply", "")
            reply = f"{orig_reply}\n\n✅ **生图成功**！" if orig_reply else "✅ **生图成功**！"
            
            # 确保 decision 包含所有必要的指令字段，特别是 parameters
            decision["reply"] = reply
            decision["action"] = "show_painter_result"
            decision["imageUrl"] = bg_url # 顶层直显支持
            params = decision.setdefault("parameters", {})
            params["imageUrl"] = bg_url
            params["prompt"] = prompt
            
            # 构造包含完整信息的 AI 消息（对话框展示时使用这些字段）
            message_content = json.dumps({
                "thought": "执行绘图完成。",
                "action": "show_painter_result",
                "reply": reply,
                "imageUrl": bg_url,
                "parameters": params
            }, ensure_ascii=False)
            
            return {
                "messages": [AIMessage(content=message_content)], 
                "final_decision": decision,
                "imageUrl": bg_url,
                "active_image_url": bg_url # 更新上下文图片地址
            }
        else:
            error_reply = "❌ 生图服务暂时波动，未能生成预览图。请重试。"
            return {"messages": [AIMessage(content=error_reply)], "final_decision": {**decision, "reply": error_reply}}

    # 其他需要后台执行的 action 可以在此扩展...
    
    return {"final_decision": decision}
