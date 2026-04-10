"""
xhs_collector.py - 小红书笔记深度采集引擎
集成自 xhs-extractor (无登录静态解析模式)

功能说明：
1. 深度解析：通过截取网页中的 `__INITIAL_STATE__` JSON 块，突破 OG 标签限制。
2. 完整正文：可提取笔记标题及全部描述文本，存入 RAG 的 ocr_text 字段。
3. 多图获取：支持提取笔记内的所有高清图片 URL 列表。
4. 鲁棒性：兼容小红书多种不同的 Web 页面 JSON 嵌套结构。

采集策略：本模块优先尝试从静态 HTML 的脚本块中进行深度反序列化，若失败则自动回退至标准 OG 标签抓取。
"""
import re
import os
import json
import httpx
import hashlib
import asyncio
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from bs4 import BeautifulSoup

from app.rag.models.note_document import NoteDocument
from app.tools.xhs_mcp_tools import XHSMCPTools
from app.tools.ocr_engine import get_ocr_processor


def extract_xhs_url(text: str) -> Optional[str]:
    """从小红书分享文案中提取 http(s) 开头的链接"""
    if not text: return None
    # 匹配完整 URL，排除空白或中文标点
    m = re.search(r"(https?://[^\s）)＞》>，,。\n\r\t]+)", text)
    if not m: return None
    url = m.group(1).strip()
    return url.rstrip("）)＞》>，,。\n\r\t")


def _extract_id_from_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    """
    从规范化的 URL 中提取 ID 和 xsec_token
    Returns: (id, xsec_token)
    """
    note_id = None
    xsec_token = None
    
    # 提取 ID
    patterns = [
        r'/explore/([a-zA-Z0-9]+)',
        r'/discovery/item/([a-zA-Z0-9]+)',
        r'/user/[^/]+/([a-zA-Z0-9]+)',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            note_id = m.group(1)
            break
            
    # 提取 xsec_token
    t_match = re.search(r'xsec_token=([a-zA-Z0-9\-_=]+)', url)
    if t_match:
        xsec_token = t_match.group(1)
        
    return note_id, xsec_token


def _parse_note_from_html(html: str, url: str) -> Dict[str, Any]:
    """
    核心解析引擎：从 HTML 中提取 __INITIAL_STATE__ 并解析
    提取逻辑迁移并精简自 xhs-extractor
    """
    soup = BeautifulSoup(html, 'html.parser')
    state = None
    
    # 定位 JSON 数据块
    for script in soup.find_all('script'):
        if script.string and '__INITIAL_STATE__' in script.string:
            # 改进提取逻辑：匹配 window.__INITIAL_STATE__= 之后到结尾或分号前的所有内容
            match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+})', script.string, re.DOTALL)
            if not match:
                # 尝试另一种常见的赋值方式
                match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?});', script.string, re.DOTALL)
            
            if match:
                try:
                    state_json = match.group(1).strip()
                    # 清理尾部可能存在的多余字符
                    if state_json.endswith(';'): state_json = state_json[:-1]
                    
                    # 将 JS 对象转换为 JSON
                    # 处理可能的非标准 JSON (如 undefined -> null)
                    state_json = state_json.replace(':undefined', ':null')
                    state = json.loads(state_json)
                except Exception as e:
                    print(f"[XHS Parser] JSON 解析失败: {e}")
            break

    note_data = {}
    if state:
        # 兼容多种结构 (xhs-extractor 模式)
        note_dict = state.get('note', {}) or state.get('noteDetail', {})
        if not note_dict and 'noteDetailMap' in state.get('note', {}):
            first_id = state['note'].get('firstNoteId')
            note_dict = state['note']['noteDetailMap'].get(first_id, {}).get('note', {})
        
        if note_dict:
            note_data['title'] = note_dict.get('title', '') or note_dict.get('displayTitle', '')
            note_data['desc'] = note_dict.get('desc', '') or note_dict.get('content', '')
            
            # 提取所有图片
            image_list = note_dict.get('imageList', []) or note_dict.get('images', []) or []
            images = []
            for img in image_list:
                img_url = ""
                if isinstance(img, str):
                    img_url = img
                elif isinstance(img, dict):
                    img_url = img.get('url') or img.get('urlDefault') or img.get('info', {}).get('url')
                
                if img_url and img_url.startswith('http'):
                    if img_url not in images:
                        images.append(img_url)
            note_data['images'] = images

    # 回退方案：如果 JSON 解析不到，使用 OG 标签
    if not note_data.get('title'):
        title_tag = soup.find('meta', property='og:title')
        note_data['title'] = title_tag['content'] if title_tag else ""
    
    if not note_data.get('images'):
        img_tag = soup.find('meta', property='og:image')
        note_data['images'] = [img_tag['content']] if img_tag else []

    return note_data


async def collect_xhs_note(url: str) -> NoteDocument:
    """采集单条小红书笔记 (MCP 优先版)"""
    # 提取纯净 URL
    clean_url = extract_xhs_url(url) or url
    
    title = ""
    desc = ""
    all_images = []
    final_url = clean_url
    note_id = None
    xsec_token = None

    # 第一步：获取最终 URL 以提取 ID 和 Token
    # 对于短链接 (xhslink.com)，必须追踪重定向
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            print(f"[XHS Collector] 🔍 正在追踪重定向: {clean_url}")
            # 使用 HEAD 或 GET 请求获取最终指向，但不处理 Body内容
            resp = await client.get(clean_url, follow_redirects=True)
            final_url = str(resp.url)
            note_id, xsec_token = _extract_id_from_url(final_url)
            
            if xsec_token:
                print(f"[XHS Collector] ✅ 成功提取令牌: ID={note_id}, Token={xsec_token[:10]}...")
            else:
                print(f"[XHS Collector] ⚠️ 未能从最终 URL 提取令牌: {final_url}")
    except Exception as e:
        print(f"[XHS Collector] ❌ 追踪 URL 失败 ({clean_url}): {e}")

    # 初始化互动数据
    likes = 0
    collected = 0
    comments = 0

    # 第二步：使用 MCP 获取详情
    try:
        mcp_data = None
        # 如果获取到了 ID 和 Token，使用高效的 REST 接口
        if note_id and xsec_token:
            print(f"[XHS Collector] 🚀 令牌获取成功，发起 MCP REST 请求: ID={note_id}")
            mcp_data = await XHSMCPTools.get_feed_detail(note_id, xsec_token)
        else:
            # 否则，尝试使用通用详情工具
            print(f"[XHS Collector] ⚠️ 令牌缺失，回退至 MCP 详情工具获取: {clean_url}")
            mcp_data = await XHSMCPTools.get_note_detail(clean_url)

        # 第三步：统一解析 MCP 返回的数据
        note = None
        if isinstance(mcp_data, dict):
            if "note" in mcp_data:
                note = mcp_data["note"]
            elif "data" in mcp_data and isinstance(mcp_data["data"], dict) and "note" in mcp_data["data"]:
                note = mcp_data["data"]["note"]
            # 兼容 search 返回的结构或其它结构
            elif "id" in mcp_data:
                note = mcp_data
        
        if note:
            title = note.get("title") or note.get("displayTitle") or ""
            desc = note.get("desc") or note.get("content") or ""
            
            # 提取互动数据 (赞、藏、评)
            interact = note.get("interactInfo") or note.get("interact_info") or {}
            likes = int(interact.get("likedCount") or interact.get("liked_count") or 0)
            collected = int(interact.get("collectedCount") or interact.get("collected_count") or 0)
            comments = int(interact.get("commentCount") or interact.get("comment_count") or 0)

            # 提取图片 (兼容多种命名)
            mcp_imgs = []
            img_list = note.get("imageList") or note.get("images") or note.get("image_list")
            if isinstance(img_list, list):
                for img in img_list:
                    if isinstance(img, dict):
                        u = img.get("url") or img.get("urlDefault") or img.get("info", {}).get("url")
                        if u: mcp_imgs.append(u)
                    elif isinstance(img, str):
                        mcp_imgs.append(img)
            
            if mcp_imgs:
                all_images = mcp_imgs
            
            # 如果之前没拿到 ID，从 note 数据里补充
            if not note_id:
                note_id = note.get("noteId") or note.get("id")

    except Exception as e:
        print(f"[XHS Collector] ❌ MCP 采集失败: {e}")

    # 兜底 ID
    if not note_id:
        note_id, _ = _extract_id_from_url(clean_url)
        if not note_id:
            note_id = hashlib.md5(final_url.encode()).hexdigest()[:12]
        
    # ID 标准化 (xhs_ 前缀)
    if not note_id.startswith("xhs_"):
        raw_id = note_id
        note_id = f"xhs_{raw_id}"

    # 基础检索文本
    ocr_text = desc

    # --- 智能 OCR 增强逻辑 (优化版) ---
    if all_images:
        print(f"[XHS Collector] 🔍 启动图片 OCR 识别 (全量图片)...")
        try:
            # 使用同步的 batch_ocr (在本地环境中运行)
            ocr_proc = get_ocr_processor()
            # 升级：不再限制张数，扫描笔记中所有图片以确保 100% 覆盖
            ocr_results = ocr_proc.batch_ocr(all_images)
            if ocr_results:
                print(f"[XHS Collector] ✅ OCR 提取完成，总长度: {len(ocr_results)}")
                # 仅保留 OCR 识别结果，不再与原文混淆，由分析 Agent 自行融合
                ocr_text = ocr_results
        except Exception as e:
            print(f"[XHS Collector] ⚠️ OCR 增强失败: {e}")
    else:
        ocr_text = ""

    # 视觉描述 (简化版)
    image_url = all_images[0] if all_images else ""
    visual_description = f"笔记：{title or '未命名'}\n共包含 {len(all_images)} 张图片。"
    style_tags = []

    # --- 图片本地化逻辑 ---
    from app.rag.image_service import image_service
    local_image_url = ""
    local_all_images = []

    if all_images:
        print(f"[XHS Collector] 📥 正在本地化 {len(all_images)} 张图片...")
        # 优先下载封面图
        local_image_url = await image_service.download_and_save(image_url, "xhs")
        
        # 并行下载所有图片
        download_tasks = [image_service.download_and_save(img, "xhs") for img in all_images]
        local_all_images = await asyncio.gather(*download_tasks)
        print(f"[XHS Collector] ✅ 图片本地化完成")

    return NoteDocument(
        id=note_id,
        url=clean_url,
        xsec_token=xsec_token, # 传入截获的令牌
        title=title or "未命名笔记",
        image_url=local_image_url or image_url,
        all_images=local_all_images or all_images,
        content=desc,         # 用于详情展示的正文
        ocr_text=ocr_text,    # 增强后的检索文本
        likes=likes,
        collected_count=collected,
        comment_count=comments,
        visual_description=visual_description,
        style_tags=style_tags,
        created_at=datetime.utcnow()
    )


async def batch_collect_xhs_notes(urls: list[str]) -> list[NoteDocument]:
    """批量采集"""
    tasks = [collect_xhs_note(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if not isinstance(r, Exception)]
