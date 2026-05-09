"""
vision_describer.py - Gemini Vision 视觉描述生成器
使用 Gemini 1.5 Flash 对图片生成视觉描述和风格标签

"""
import os
import json
import httpx
from typing import Optional


from app.core.llm_config import get_llm_config

async def describe_image_with_vision(image_buffer: Optional[bytes] = None, image_url: Optional[str] = None, title: str = "", mode: str = "describe") -> dict:
    """
    使用 Vision 大模型对图片生成视觉描述或进行分类
    mode: "describe" (默认描述) 或 "classify" (判断是否为表格/数据)
    """
    # 获取配置
    try:
        base_url, api_key = await get_llm_config()
    except Exception as e:
        print(f"[Vision Describer] ⚠️ 获取配置失败: {e}")
        return {"description": title or "图片内容", "style_tags": [], "is_table": False}

    if not api_key:
        print("[Vision Describer] ⚠️ 未配置 API_KEY，跳过 Vision 描述")
        return {"description": title or "图片内容", "style_tags": [], "is_table": False}
    
    # 准备图片内容对象
    if image_buffer:
        import base64
        base64_img = base64.b64encode(image_buffer).decode('utf-8')
        image_obj = {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
    elif image_url:
        image_obj = {"type": "image_url", "image_url": {"url": image_url}}
    else:
        return {"description": "无效图片", "style_tags": [], "is_table": False}

    if mode == "classify":
        prompt = "分析这张图片的内容类型。如果是表格、数据清单、复杂报表或带有大量数字的公文，则返回 'table'；如果是普通的照片、插画、装饰性图片或风景图，则返回 'image'。只输出这一个单词，严禁其他内容。"
    else:
        prompt = f"""你是一个极度精确的视觉分析专家。请分析上传的图片并返回 JSON 格式结果。

**语言要求 (CRITICAL)**：所有返回内容（包括 `description` 中的摘要、描述及 `style_tags`）必须且只能使用**简体中文**。即使图片中含有英文，描述也必须转译为中文。

1. **基本描述**：用 100 字以内客观描述图片内容。
2. **分类定义 (CRITICAL)**：
   - 如果图片是带有背景图、装饰图案或非均匀布局的【宣传海报】或【广告图】（即使含有排版文字块），请标记 `is_table: false`。
   - 仅当图片中包含明确的网格行/列结构的【纯数据表格】或【标准数据清单】时，才标记 `is_table: true`。

3. **表格提取指令 (仅当 is_table 为 true 时生效)**：
   - **第一步：语义摘要**。在返回的 description 最前面，增加一行对该表格内容的中文语义概述。
   - **第二步：还原表格**。将图片中的表格内容**完整、无删减、逐行**地还原为 HTML 表格格式 (`<table>...</table>`)。
   - **必须识别合并单元格**：必须检测并使用 `rowspan` 和 `colspan`。特别是最左侧的分类单元格，严禁将其拆分为多个单行单元格。
   - **行数绝对对齐**：必须包含表头行。图片中有多少行，HTML 中就必须有多少个 `<tr>` 标签。**严禁漏行数据**。
   - 必须保留每一个单元格的数据，包括链接、内容或特殊符号。

4. **输出格式**：
   {{
     "is_table": true/false,
     "description": "中文语义摘要 + HTML表格代码",
     "style_tags": ["标签1", "标签2"]
   }}

参考上下文：{title if title else '无'}
只输出 JSON，不要有任何 Markdown 包裹块或其他解释性文字。"""

    # 支持的模型序列（按优先级排序）
    models = ["gemini-2.5-flash", "gpt-4o-mini"]
    
    last_error = ""
    for model_name in models:
        try:
            print(f"[Vision Describer] 🚀 尝试使用模型: {model_name} (Mode: {mode})")
            cur_payload = {
                "model": model_name,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            image_obj,
                            {"type": "text", "text": prompt}
                        ]
                    }
                ],
                "max_tokens": 4000 if mode != "classify" else 10,
                "temperature": 0.1
            }
            
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json=cur_payload
                )
                
                if resp.status_code == 429:
                    print(f"  └── ⚠️ 模型 {model_name} 负载饱和 (429)，尝试下一个备选...")
                    continue
                
                resp.raise_for_status()
                data = resp.json()
                
            content = data["choices"][0]["message"]["content"].strip()
            # print(f"[Vision Debug] 原始模型响应: {content[:300]}...") 
            
            if mode == "classify":
                return {"is_table": "table" in content.lower()}

            # 增强型 JSON 解析
            import re
            m = re.search(r'\{[\s\S]*\}', content)
            if m:
                try:
                    # 尝试清理可能影响解析的尾随字符
                    clean_json = m.group(0)
                    result = json.loads(clean_json)
                    desc = result.get("description", "")
                    # 如果结果中有 description，则认为成功
                    if desc and len(desc) > 5:
                        return {
                            "description": desc,
                            "style_tags": result.get("style_tags", []),
                            "is_table": result.get("is_table", False)
                        }
                except Exception as json_err:
                    print(f"  └── ⚠️ JSON 解析内部失败: {json_err}")
            
            # 如果解析 JSON 失败但 content 本身不空，作为兜底返回
            if len(content) > 10:
                print(f"  └── 🛠 采用非 JSON 兜底内容")
                return {"description": content[:500], "style_tags": [], "is_table": False}
                
        except Exception as e:
            last_error = str(e)
            print(f"  └── ❌ 模型 {model_name} 运行异常: {e}")
            continue # 尝试下一个模型

    # 如果所有模型都失败
    print(f"[Vision Describer] 🛑 所有模型尝试完毕，全部失败。最后错误: {last_error}")
    return {"description": f"{title} (视觉描述生成暂不可用)", "style_tags": [], "is_table": False}
