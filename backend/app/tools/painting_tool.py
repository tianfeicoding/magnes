"""
Painting Tool
调用默认 API 接口（如 Nano-Banana 2）。
支持文本生图 (T2I) 和图生图 (I2I) 模式，作为后端任务执行引擎的原子工具。
"""
import os
import aiohttp
import logging
import asyncio
import traceback
from typing import Optional, Dict, Any, List
from app.core import llm_config
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

async def call_image_generate(
    prompt: str,
    size: str = "1024x1024",
    quality: str = "standard",
    model: str = "nano-banana",
    image_url: Optional[str] = None, # 兼容单图参数
    image_urls: Optional[List[str]] = None, # 支持多图列表
    image_size: Optional[str] = "4K",
    db: Optional[AsyncSession] = None
) -> Optional[str]:
    """
    调用生图接口（标准 OpenAI DALL-E 3 格式）。
    """
    # [LOGIC FIX] 统一使用标准接口格式，不再区分 nano-banana-2。
    pass
    
    # 统一使用 LLM 配置逻辑
    base_url, api_key = await llm_config.get_llm_config(db=db)
    
    # 统一整合图片源
    final_urls = []
    if image_urls:
        final_urls.extend(image_urls)
    elif image_url:
        final_urls.append(image_url)

    if not api_key:
        print(f"[Painting Tool] ❌ 未找到 API_KEY (Model: {model})，生图失败")
        return None

    # 【API 修复】服务商的 /v1/images/edits 接口强制要求 Multipart 协议，导致 JSON 请求报 500。
    # 相比之下，/v1/images/generations 接口支持携带 image_urls 的 JSON payload，兼容性更好。
    url = f"{base_url}/images/generations"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Magnes/1.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "response_format": "url"
    }

    # 统一使用标准 OpenAI DALL-E 3 格式
    payload["size"] = size
    payload["quality"] = quality

    # 注入 I2I 参数 (适配支持多重绘的模型)
    if final_urls:
        import base64
        processed_urls = []
        for img in final_urls:
            # [URL INTERCEPTOR] 劫持本地 URL 并转换为 Base64
            # 外部 API (如 t8star) 无法访问开发者本地的 localhost:8088 地址
            if "localhost:8088" in img:
                try:
                    # 路径还原：http://localhost:8088/skills_assets/ -> .agent/
                    # 我们从 main.py 的挂载逻辑中反向推导
                    relative_url = img.split("localhost:8088")[-1]
                    local_file_path = None
                    
                    if relative_url.startswith("/skills_assets/"):
                        # /skills_assets/ -> .agent/
                        sub_path = relative_url.replace("/skills_assets/", "", 1)
                        local_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".agent", sub_path))
                    elif relative_url.startswith("/uploads/"):
                        # /uploads/ -> data/uploads/ (注意：data 目录在 backend 文件夹下)
                        sub_path = relative_url.replace("/uploads/", "", 1)
                        local_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads", sub_path))
                    
                    if local_file_path and os.path.exists(local_file_path):
                        with open(local_file_path, "rb") as f:
                            encoded_str = base64.b64encode(f.read()).decode("utf-8")
                            # 简单的后缀探测
                            ext = local_file_path.split(".")[-1].lower()
                            mime = f"image/{ext}" if ext != "jpg" else "image/jpeg"
                            img = f"data:{mime};base64,{encoded_str}"
                            print(f"[Painting Tool] 🔄 Local URL Proxied: {local_file_path} -> Base64")
                    else:
                        print(f"[Painting Tool] ⚠️ Local path not found or unhandled: {img} (Path: {local_file_path})")
                except Exception as e:
                    print(f"[Painting Tool] ❌ Proxy Error for {img}: {e}")

            if not img.startswith("http") and not img.startswith("data:"):
                if "," not in img:
                    img = f"data:image/jpeg;base64,{img}"
            processed_urls.append(img)

        payload["image_urls"] = processed_urls

    try:
        mode_str = "I2I" if final_urls else "T2I"
        print(f"DEBUG: [Painting Tool] Request Details:")
        print(f"  - URL: {url}")
        print(f"  - Model: {model}")
        print(f"  - Headers User-Agent: {headers.get('User-Agent')}")
        print(f"  - Mode: {mode_str}")
        print(f"  - Settings: http2=False, timeout=180.0")

        # --- Log Payload Snapshot ---
        log_payload = payload.copy()
        
        # 处理 image 和 image_urls 列表键进行截断打印
        for key in ["image", "image_urls"]:
            if key in log_payload and isinstance(log_payload[key], list):
                new_vals = []
                for val in log_payload[key]:
                    if isinstance(val, str) and len(val) > 100:
                        new_vals.append(f"{val[:30]}...[Length={len(val)}]...{val[-20:]}")
                    else:
                        new_vals.append(val)
                log_payload[key] = new_vals
        
        print(f"DEBUG: [Painting Tool] Full Payload: {log_payload}")
        # ----------------------------
        
        # 强制使用 HTTP/1.1 并增加超时
        # aiohttp 默认更宽松，但我们显式禁用 HTTPS 验证（前端通常也是）以防证书问题，并增加超时
        timeout = aiohttp.ClientTimeout(total=300.0) # 5分钟大超时
        async with aiohttp.ClientSession(timeout=timeout) as session:
            print(f"DEBUG: Sending POST request via aiohttp...")
            async with session.post(url, headers=headers, json=payload, ssl=False) as response:
                
                if response.status != 200:
                    error_text = await response.text()
                    print(f"[Painting Tool] ❌ 生图 API 错误: {response.status} - {error_text}")
                    return None
                
                result = await response.json()
                # 标准响应格式：{"data": [{"url": "..."}]}
                if "data" in result and len(result["data"]) > 0:
                    out_url = result["data"][0].get("url")
                    print(f"[Painting Tool] 🎉 生图成功: {out_url}")
                    return out_url
                else:
                    print(f"[Painting Tool] ❌ 返回格式异常: {result}")
                    return None
                
    except aiohttp.ClientPayloadError as e:
        print(f"[Painting Tool] ❌ Payload Error (Too Large/Disconnect): {repr(e)}")
        return None
    except aiohttp.ClientError as e:
        print(f"[Painting Tool] ❌ Network Error (aiohttp): {repr(e)}")
        traceback.print_exc()
        return None
    except Exception as e:
        print(f"[Painting Tool] ❌ 调用发生异常 ({type(e).__name__}): {str(e)}")
        traceback.print_exc()
        return None

if __name__ == "__main__":
    # 快速测试代码
    async def test():
        url = await call_image_generate("A minimalist cold style poster background with misty mountains, cool tones")
        print(f"Test Result: {url}")
    
    if os.getenv("API_KEY"):
        asyncio.run(test())
