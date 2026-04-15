"""
Visual Analyzer
核心视觉分析工具，集成多种大模型能力：
1. Qwen-Image-Layered: 负责将单张海报智能拆分为多个透明图层资产。
2. Gemini-3-Pro: 负责对海报的视觉风格、文字布局进行语义化分析。
包含完整的任务提交与异步轮询逻辑。
"""
from typing import Dict, Any, List, Optional
import os
import json
import asyncio
import httpx
import aiohttp
import re
from PIL import Image
from io import BytesIO
from app.core import prompts, llm_config
from sqlalchemy.ext.asyncio import AsyncSession

async def call_qwen_image_layered(image_url: str, prompt: str = None, num_layers: int = 4, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """
    调用 302.ai 的 qwen-image-layered 异步接口并自动轮询结果。
    """
    base_url, api_key = await llm_config.get_llm_config(db=db, is_layering=True)
    
    # 提交任务的接口
    submit_endpoint = f"{base_url}/302/submit/qwen-image-layered" 
    # 查询结果的接口 (根据文档，通常是在 submit 路径后跟 query 参数)
    status_endpoint = f"{base_url}/302/submit/qwen-image-layered"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # 按照 OpenAPI 文档补全必修课参数
    payload = {
        "image_url": image_url,
        "prompt": prompt or prompts.REGION_DETECTION["main"],
        "num_layers": num_layers,
        "enable_safety_checker": False, 
        "output_format": "webp" 
    }

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            # 1. 提交任务
            print(f"[Visual Analyzer] 提交分层任务...")
            print(f"   - Endpoint: {submit_endpoint}")
            
            # 缩减打印 Payload 中的图片数据，防止刷屏
            log_payload = payload.copy()
            if isinstance(log_payload.get("image_url"), str) and len(log_payload["image_url"]) > 100:
                url = log_payload["image_url"]
                log_payload["image_url"] = f"{url[:50]}...[truncated {len(url)-60} chars]...{url[-10:]}"
            
            print(f"   - Payload: {json.dumps(log_payload, indent=2, ensure_ascii=False)}")
            
            response = await client.post(submit_endpoint, json=payload, headers=headers)
            response.raise_for_status()
            submit_result = response.json()
            
            # 调试：查看提交结果全貌
            # print(f"[Visual Analyzer] Debug Submit: {json.dumps(submit_result, indent=2)}")

            # 检查提交阶段是否有报错
            if "error" in submit_result:
                print(f"[Visual Analyzer] 🛑 提交拒绝: {submit_result['error'].get('message_cn')}")
                return {"layers": [], "error": "safety_flagged"}

            request_id = submit_result.get("request_id")
            if not request_id:
                return {"layers": [], "error": "No request_id"}
            
            print(f"[Visual Analyzer] 任务 ID: {request_id}. 正在排队等待...")

            # 2. 轮询结果 (延长至约 400 秒，适配 302.ai 慢速模型)
            max_retries = 200 
            for i in range(max_retries):
                await asyncio.sleep(2) 
                
                status_url = f"{status_endpoint}?request_id={request_id}"
                status_response = await client.get(status_url, headers=headers)
                status_result = status_response.json()
                
                # 打印状态信息（每10次打印一次，避免刷屏）
                if i % 10 == 0:
                    status_info = status_result.get("status", "unknown")
                    print(f"[Visual Analyzer] 轮询 ({i+1}/{max_retries}) Status: {status_info}")

                # [核心逻辑]：尝试多种可能的图像资产路径
                images = status_result.get("images") or status_result.get("output", {}).get("images")
                if images and len(images) > 0:
                    print(f"[Visual Analyzer] 🎉 恭喜！正式检测到 {len(images)} 个图层资产。")
                    return status_result
                
                status_detail = str(status_result.get("detail", "")).lower()
                status = str(status_result.get("status", "")).upper()
                
                is_processing = "progress" in status_detail or status in ["IN_QUEUE", "IN_PROGRESS", "PROCESSING", "PENDING"]
                
                if "error" in status_result:
                    msg = status_result["error"].get("message_cn", "模型计算出错")
                    print(f"[Visual Analyzer] 🛑 报错: {msg}")
                    return {"layers": [], "error": msg}

                if is_processing:
                    if i % 5 == 0: 
                        print(f"[Visual Analyzer] 状态: {status} | 制作中... (服务器正在努力分层)")
                    continue
                
                if status in ["COMPLETED", "SUCCESS"]:
                    # 即使状态是 SUCCESS，如果没有图片，也再等等或者返回
                    if images:
                        return status_result
                    else:
                        print(f"[Visual Analyzer] 状态已完成但未见图片，继续等待...")
                        continue
                elif status in ["FAILED", "CANCELLED", "ERROR"]:
                    print(f"[Visual Analyzer] ❌ 任务失败: {status}")
                    return {"layers": [], "error": status}
            
            print("[Visual Analyzer] 🕙 轮询超时")
            return {"layers": [], "error": "timeout"}
            
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            # 截断错误响应，避免打印完整的base64图片
            if len(error_body) > 500:
                error_body = f"{error_body[:200]}...[truncated {len(error_body)-400} chars]...{error_body[-200:]}"
            print(f"[Visual Analyzer] 🛑 HTTP 错误 ({e.response.status_code}): {error_body}")
            return {"layers": [], "error": f"HTTP {e.response.status_code}: {error_body}"}
        except Exception as e:
            import traceback
            error_msg = str(e)
            # 截断异常信息，避免打印完整的base64图片
            if len(error_msg) > 500:
                error_msg = f"{error_msg[:200]}...[truncated {len(error_msg)-400} chars]...{error_msg[-200:]}"
            print(f"[Visual Analyzer] 🛑 API 调用发生非预期异常: {error_msg}")
            traceback.print_exc()
            return {"layers": [], "error": f"{type(e).__name__}: {str(e)}"}

def transform_to_magnes_schema(analysis_result: Dict[str, Any], width: int = None, height: int = None) -> Dict[str, Any]:
    """
    将 API 返回转换。加入语义化命名逻辑。
    """
    layers = analysis_result.get("layers") or analysis_result.get("images") or []
    
    magnes_layers = []
    num_total = len(layers)
    
    # 动态比例探测：尝试获取原始图片的比例，
    # 如果外部传入了 width/height (来自前端)，则优先使用
    canvas_w, canvas_h = width or 1000, height or 1333
    
    if not width or not height: # 如果前端没传，才尝试探测
        try:
            if layers and len(layers) > 0:
                first_url = layers[0] if isinstance(layers[0], str) else layers[0].get("url")
                if first_url:
                    # 如果是本地文件
                    if first_url.startswith('/'):
                        with Image.open(first_url) as img:
                            w, h = img.size
                            canvas_h = int(1000 * (h / w))
                            canvas_w = 1000
                            print(f"[Visual Analyzer] Detected local image ratio: {w}x{h} -> Canvas H: {canvas_h}")
        except Exception as e:
            print(f"[Visual Analyzer] Ratio detection failed: {e}")

    canvas = {"width": canvas_w, "height": canvas_h}
    
    for i, layer_data in enumerate(layers):
        # 兼容处理：有些返回是字符串列表，有些是包含 url 的字典
        url = layer_data if isinstance(layer_data, str) else layer_data.get("url")
        
        # --- 语义化命名逻辑 ---
        # 通常 Qwen-Layered 的序列是：[主体1, 主体2, ..., 背景]
        # 或者 [背景, 主体1, ...] 取决于模型版本，但 Qwen-Image-Layered 
        # 最后一个通常是背景（Base layer）
        
        layer_role = "element"
        layer_name = f"layer_{i}"
        
        if i == num_total - 1:
            layer_role = "reference_layer"
            layer_name = "original_background"
        elif i == 0:
            layer_role = "subject"
            layer_name = "main_subject"
        
        magnes_layers.append({
            "id": layer_name,
            "type": "image",
            "url": url,
            "role": layer_role,
            "label": "原始背景" if layer_role == "reference_layer" else (f"主体资产" if layer_role == "subject" else f"图层元素 {i}"),
            "bbox": [0, 0, 1000, 1000], # 强制回归 0-1000 标准归一化坐标系
            "z_index": i * 10,
            "opacity": 1.0
        })
        
    return {
        "canvas": canvas,
        "layers": magnes_layers
    }

def extract_json_blocks_from_md(text: str) -> List[Dict[str, Any]]:
    """
    从 AI 返回的 Markdown 文本中提取所有 JSON 块。
    """
    blocks = []
    # 1. 优先尝试匹配所有 ```json ... ``` 块
    json_matches = re.findall(r'```json\s*([\s\S]*?)\s*```', text, re.IGNORECASE)
    for match in json_matches:
        try:
            blocks.append(json.loads(match.strip()))
        except:
            continue
            
    if not blocks:
        # 2. 如果没找到代码块，尝试寻找大括号闭合结构 (贪婪匹配第一个)
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            try:
                blocks.append(json.loads(text[first_brace:last_brace+1]))
            except:
                pass
                
    return blocks

def extract_json_from_md(text: str) -> Optional[Dict[str, Any]]:
    """向后兼容：提取第一个 JSON 块"""
    blocks = extract_json_blocks_from_md(text)
    return blocks[0] if blocks else None

def parse_ai_design_protocol(ai_content: str) -> List[Dict[str, Any]]:
    """
    解析 AI 返回的视觉分析协议，提取图层列表。
    适配 TEMPLATE_REFINER 和 REGION_DETECTION 两种返回格式。
    """
    data = extract_json_from_md(ai_content)
    if not data:
        return []
    
    layers = []
    # 格式 A: TEMPLATE_REFINER -> { "layout": { "elements": [...] } }
    raw_elements = data.get("layout", {}).get("elements") or data.get("elements")
    # 格式 B: REGION_DETECTION -> { "textRegions": [...] }
    if not raw_elements:
        raw_elements = data.get("textRegions", [])
        
    if not isinstance(raw_elements, list):
        return []
        
    for i, el in enumerate(raw_elements):
        # 兼容处理 BBox 格式: [x,y,w,h] 或 {x,y,width,height}
        b = el.get("bbox", {})
        if isinstance(b, list) and len(b) == 4:
            bbox = b
        else:
            bbox = [
                b.get("x", 0),
                b.get("y", 0),
                b.get("width", b.get("w", 0)),
                b.get("height", b.get("h", 0))
            ]
            
        el_type = el.get("type", "text")
        # 允许 placeholder_image 映射为标准的 image 类型图层，并标记特殊 role
        actual_type = "image" if el_type == "placeholder_image" else "text"
        
        layer = {
            "id": f"ai_{actual_type}_{i}_{int(asyncio.get_event_loop().time())}",
            "type": actual_type,
            "content": el.get("content") or el.get("text") or "",
            "text": el.get("content") or el.get("text") or "", 
            "bbox": bbox,
            "z_index": 200 + i,
            "role": el_type,
            "label": "占位图" if actual_type == "image" else "文本图层"
        }
        
        if actual_type == "text":
            style = el.get("style", {})
            layer["style"] = {
                "fontSize": style.get("fontSize") or el.get("fontSize") or 40,
                "color": style.get("color") or el.get("color") or "#000000",
                "fontWeight": style.get("fontWeight") or "bold",
                "textAlign": style.get("textAlign") or "left"
            }
        else:
            # 占位图 URL：使用带描述的占位符，增强视觉回馈
            content_desc = (el.get("content") or "Activity Image").replace(" ", "+")
            layer["url"] = f"https://placehold.co/400x300/000000/FFFFFF/png?text={content_desc}"
            
        layers.append(layer)
        
    return layers

async def analyze_visual_style(prompt: str, image_urls: List[str], model: str = None, db: Optional[AsyncSession] = None) -> Dict[str, Any]:
    """
    使用视觉大模型 (默认 Gemini 3 Pro) 进行视觉分析。
    增加了指数退避重试机制，应对 503/429 等波动。
    """
    # 统一获取 LLM 配置（已包含用户设置的数据库配置）
    base_url, api_key = await llm_config.get_llm_config(db=db)

    # 不再覆盖 base_url，使用 get_llm_config 返回的值（已包含用户设置）
    # 只需确保格式正确
    base_url = base_url.rstrip('/')
    if not base_url.endswith('/v1'):
        base_url = f"{base_url}/v1"
        
    from app.rag import config
    target_model = model or config.DEFAULT_REFINER_MODEL

    # --- 诊断日志 ---
    print(f"[VisualAnalyzer] [Vision] 使用模型: {target_model}", flush=True)
    print(f"[VisualAnalyzer] 接收到的 Prompt 前 100 字: {str(prompt)[:100]}...", flush=True)
    
    # 统一逻辑：既然上面已经确保 base_url 以 /v1 结尾，此处无需再加 /v1
    endpoint = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Magnes/1.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    # 智能增强：确保 prompt 始终为有效字符串，防止 null 导致 API 异常
    actual_prompt = str(prompt) if prompt is not None else ""
    content_list = [{"type": "text", "text": actual_prompt}]
    
    if len(image_urls) > 1:
        index_guide = "\n\n(注：你当前收到了多张参考图，请按顺序识别：第1张图即为【图1/Image 1】，第2张图即为【图2/Image 2】，以此类推。)"
        content_list[0]["text"] += index_guide

    messages = [
        {
            "role": "user",
            "content": [
                *content_list,
                *[{"type": "image_url", "image_url": {"url": url}} for url in image_urls]
            ]
        }
    ]

    payload = {
        "model": target_model,
        "messages": messages,
        "max_tokens": 8192,
        "temperature": 0.2
    }

    # --- Log Payload with Truncation ---
    # 先创建用于日志的截断版本，避免直接序列化原始payload（可能包含超大base64）
    log_payload = payload.copy()
    safe_messages = []
    total_image_size = 0
    for msg in messages:
        if isinstance(msg.get("content"), list):
            new_content = []
            for item in msg["content"]:
                if item.get("type") == "image_url":
                    url = item["image_url"].get("url", "")
                    total_image_size += len(url)
                    if len(url) > 100:
                        new_content.append({"type": "image_url", "image_url": {"url": f"{url[:30]}...[Base64 Length={len(url)}]...{url[-20:]}"}})
                    else:
                        new_content.append(item)
                else:
                    new_content.append(item)
            safe_messages.append({"role": msg["role"], "content": new_content})
        else:
            safe_messages.append(msg)
    log_payload["messages"] = safe_messages

    # 计算原始payload大小（用于日志显示）
    json_payload = json.dumps(payload, ensure_ascii=False)
    payload_size_kb = len(json_payload.encode('utf-8')) / 1024

    print(f"DEBUG: [Visual Analyzer] Starting Request:")
    print(f"   - Target URL: {endpoint}")
    print(f"   - Payload Size: {payload_size_kb:.2f} KB")
    print(f"   - Images Count: {len(image_urls)}")
    print(f"   - Total Image Base64 Size: {total_image_size/1024:.2f} KB")
    print(f"   - Model: {target_model}")
    # 打印截断后的消息内容
    for i, msg in enumerate(safe_messages):
        content_preview = ""
        if isinstance(msg.get("content"), list):
            # 提取文本内容预览
            texts = [item.get("text", "") for item in msg["content"] if item.get("type") == "text"]
            content_preview = texts[0][:80] + "..." if texts else "[图片消息]"
        else:
            content_preview = str(msg.get("content", ""))[:80] + "..."
        print(f"   - Message {i}: {content_preview}")
    # -----------------------------------------

    max_retries = 3
    retry_delay = 2

    # 驱动切换：使用 aiohttp 替代 httpx 解决 ReadError 问题
    # 设置长超时以适配视觉分析任务
    timeout = aiohttp.ClientTimeout(total=300, connect=30, sock_read=300)
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for attempt in range(max_retries):
            try:
                attempt_start = asyncio.get_event_loop().time()
                print(f"[Visual Analyzer] [Attempt {attempt+1}/{max_retries}] Starting POST via aiohttp...")
                
                async with session.post(endpoint, json=payload, headers=headers, ssl=False) as response:
                    duration = asyncio.get_event_loop().time() - attempt_start
                    print(f"[Visual Analyzer] Response received in {duration:.2f}s. Status: {response.status}")
                    
                    if response.status in [503, 502, 504, 429]:
                        print(f"[Visual Analyzer] ⚠️ Server busy ({response.status}). Retrying...")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(retry_delay * (2 ** attempt))
                            continue
                    
                    if response.status != 200:
                        error_body = await response.text()
                        # 截断错误响应，避免打印完整的base64图片
                        if len(error_body) > 500:
                            error_body = f"{error_body[:200]}...[truncated {len(error_body)-400} chars]...{error_body[-200:]}"
                        print(f"[Visual Analyzer] 🛑 API Error ({response.status}): {error_body}")
                            
                    response.raise_for_status()
                    res_data = await response.json()
                    
                    content = res_data["choices"][0]["message"]["content"]
                    print(f"[Visual Analyzer] 🎉 Successfully received analysis ({len(content)} chars)")
                    return {"status": "success", "content": content}
                    
            except aiohttp.ClientResponseError as e:
                print(f"[Visual Analyzer] 🛑 HTTP Error ({e.status}): {e.message}")
                if e.status not in [503, 502, 504, 429] or attempt == max_retries - 1:
                    return {"status": "error", "message": f"HTTP {e.status}"}
            except aiohttp.ClientPayloadError as e:
                print(f"[Visual Analyzer] 🛑 Payload Error (可能载荷过大): {str(e)}")
                return {"status": "error", "message": "Payload Error"}
            except Exception as e:
                error_msg = str(e)
                # 截断异常信息，避免打印完整的base64图片
                if len(error_msg) > 500:
                    error_msg = f"{error_msg[:200]}...[truncated {len(error_msg)-400} chars]...{error_msg[-200:]}"
                print(f"[Visual Analyzer] 🛑 Unexpected Error: {error_msg}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                    continue
                return {"status": "error", "message": str(e)}

    return {"status": "error", "message": "Maximum retries reached"}
