"""
Inspiration Analyst Agent
专门负责对灵感库 (xhs_covers) 进行深度汇总与多模态数据聚合。
"""
from typing import List, Any
import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from app.rag.retrieval.workflow import run_style_retrieval
from app.core import llm_config

INSPIRATION_ANALYST_PROMPT = """你是一个顶尖的市场灵感分析专家。
你的任务是根据从“灵感库”检索到的多篇小红书笔记（包含图片 OCR 文字和笔记正文），进行深度总结。

用户目标：{user_goal}

输出规范 (极其重要):
1. **禁止开场白**：禁止输出任何引导语、铺垫语或开场白（例如“根据您的需求...”、“以下是为您总结的...”等）。
2. **直接输出核心内容**：必须直接从第一条活动信息或文案的第一行开始。
3. **不要提及模式名称**：不要在回复中包含“结构化清单模式”或“预览模式”字样。
4. **活动名称格式**：**禁止**使用“活动名称：”、“名称：”或“Project：”等前缀标签。直接在第一行写活动的名字。

分析要求：
1. **意图识别**：
2. **输出模式判定与控制逻辑 (核心准则)**：
   - **判定逻辑**：严禁无故使用图标。必须当用户指令包含“Emoji”、“图标”、“极简”、“简约”等明确词汇时，才开启“图标极简模式”。
   
   - **模式 A：标准文字标题模式 (默认模式)**：
      - **视觉特征**：纯文字，零图标。
      - **排版要求**：每一行内容必须以加粗的中文标题引导。
      - **可用标题**：**时间**:, **地点**:, **门票**:, **亮点**: (必须带加粗符号和冒号)。
      - **示例**：
          苏河湾野草莓市集
          **时间**: 3月20日-3月22日
          **地点**: 上海苏河湾万象天地L1户外
          **门票**: 免费
          **亮点**: 集合了各种美食和手工艺术，适合家庭出游

   - **模式 B：图标极简代标题模式 (Emoji 模式 - 需明确请求)**：
      - **视觉特征**：图标起始，无文字标题，极致简约。
      - **排版要求**：每一行内容严禁出现“时间”、“地点”等汉字。必须直接以对应的图标起始。
      - **图标对照**：⏰(时间), 📍(地点), 🎫(价格), ✨(亮点)。
      - **示例**：
          苏河湾野草莓市集
          ⏰ 03.20-03.22
          📍 上海苏河湾万象天地L1户外
          🎫 免费
          ✨ 集合了各种美食和手工艺术

   - **换行符压力测试规范 (核心准则)**：
        - **活动内部 (紧凑规则)**：每行信息之间**只能**使用单个换行符 (\n)。严禁在属性行之间插入空行。
        - **活动之间 (空行规则)**：不同活动之间**必须**使用两个换行符 (\n\n) 产生一个明确的空行。
   - 禁止将多条活动信息连在一起输出，也禁止在单行内堆叠多个字段。

3. **小红书笔记文案模式**：
   - 包含所有提到的活动名称。
   - 简单介绍这个月有哪些好玩的活动，好在哪里。
   - 风格活泼，使用小红书常用 Emoji。

4. **引用标注守则 (核心要求)**：
   - **精确溯源 (关键要求)**：必须在总结的每个活动名称、事实点后显式打标。如果你列出了多个不同的活动，**每一个活动**的标题或结尾都必须带有来源标记（如 `[[笔记1]]`），严禁漏打。
   - 引用格式：`[[笔记N]]`。若能确定到特定图片或行，请使用 `[[笔记N][图片M]]` 或 `[[笔记N][第L行]]`。
   - **进阶：若是图片中的 OCR 文字，推荐使用 `[[笔记N][图片M, 第L行]]` 这种组合格式。**
   - **剔除冗余：** 严禁从原始笔记中直接复制 `[一R]`、`[二R]`、`(图1)` 等标记到正文中。如需指代图片，必须将其统一转换为规范的 `[[笔记N][图片M]]` 形式。
   - 支持多源引用，如 `[[笔记1, 笔记2]]`。
   - **必需：在文案最末尾附带 [引用列表]**，格式必须严格如下：
     笔记1: 《笔记标题》 [xhs_id_1]
     笔记2: 《笔记标题》 [xhs_id_2]
     ...
   - **引用准则 (极其重要)**：
     1. 你提取的任何信息（时间、地点、价格）必须**且只能**来自下方的“参考资料”。
     2. 严禁基于自己的训练数据虚构笔记内容或活动详情。
     3. 若参考资料中只有一个笔记，你总结的内容必须仅针对该笔记，不得编造更多笔记。
   - 注意：笔记标题请从参考资料的“笔记[N]: 《标题》”中提取。

--- 参考资料 (由 RAG 召回) ---
{context}
"""

async def analyze_inspiration_logic(query: str, limit: int = 15, selected_ids: List[str] = None) -> (str, List[dict]):
    """
    具体的灵感分析逻辑实现。
    支持从 selected_ids 中提取固定资料，或根据 query 进行扩容检索。
    """
    print(f"--- [Inspiration Analyst] 正在深度分析灵感库 (选中状态: {'None' if selected_ids is None else len(selected_ids)}, 查询: {query[:30]}...) ---")
    
    search_results = []
    
    # 获取可用模版列表 (V24)
    from app.core.template_utils import get_available_template_names
    template_list = await get_available_template_names()
    
    # 1. 优先获取选中 ID
    if selected_ids:
        from app.rag.vectorstore.chroma_store import get_xhs_collection
        try:
            col = get_xhs_collection()
            res = col.get(ids=selected_ids)
            print(f"[InspirationAnalyst] 📥 Chroma 查询结果: ids={res['ids']} (请求: {selected_ids})")
            for i, doc_id in enumerate(res["ids"]):
                search_results.append({
                    "id": doc_id,
                    "metadata": res["metadatas"][i] if res["metadatas"] else {}
                })
        except Exception as e:
            print(f"[InspirationAnalyst] 加载选中笔记失败: {e}")

    # 2. 如果满足不了数量要求，或没有选中，则执行扩容检索
    # [Strict Mode Fix] 如果用户已经选中了笔记（即便为空列表 []），我们认定用户处于“显式筛选模式”，不再进行自动搜索扩容
    # 只有当 selected_ids 为 None (后端/老前端内部调用) 时才允许自由搜索
    if not search_results and selected_ids is None:
        print("[InspirationAnalyst] 未检测到显式选中列表，执行 RAG 全局扩容检索...")
        search_data = await run_style_retrieval(
            query=query,
            collection="xhs_covers",
            top_k=max(30, limit),
            selected_doc_ids=selected_ids
        )
        candidates = search_data.get("results", [])
        existing_ids = {r["id"] for r in search_results if "id" in r}
        for cand in candidates:
            cid = cand.get("doc_id") or cand.get("id")
            if cid and cid not in existing_ids:
                search_results.append({
                    "id": cid,
                    "metadata": cand.get("metadata", {}),
                    "score": cand.get("score", 0)
                })
                existing_ids.add(cid)
    elif not search_results and selected_ids is not None:
        print("[InspirationAnalyst] ⚠️ 显式选中列表为空，根据策略禁止超纲检索。")
        return "您当前已开启筛选模式但未选中任何笔记，请先在素材库勾选想要分析的笔记。", []

    if not search_results:
        return "在灵感库中未找到相关笔记，建议先在灵感库搜索并抓取一些内容。", []

    # 3. 构造上下文：聚合 OCR 和正文
    context_blocks = []
    for i, res in enumerate(search_results[:limit]):
        meta = res.get("metadata", {})
        title = meta.get("title", "无标题")
        content = meta.get("content", "")
        ocr = meta.get("ocr_text", "")
        
        block = f"笔记[{i+1}]: 《{title}》 (ID: {res.get('id')})\n"
        block += f"[正文内容]: {content[:600]}...\n"
        if ocr: block += f"[图片 OCR 文字曝光]: {ocr}\n"
        context_blocks.append(block)
    
    context_str = "\n\n".join(context_blocks)

    # 4. 调用大模型进行深度分析
    from app.rag import config
    base_url, api_key = await llm_config.get_llm_config()
    model_name = config.DEFAULT_INSPIRATION_MODEL
    
    print(f"[InspirationAnalyst] 使用模型: {model_name}", flush=True)

    llm = ChatOpenAI(
        model=model_name, 
        api_key=api_key,
        base_url=base_url,
        temperature=0.3
    )
    
    prompt = INSPIRATION_ANALYST_PROMPT.replace("{user_goal}", query) \
                                      .replace("{context}", context_str) \
                                      .replace("{template_list}", template_list)
    
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    content = response.content
    
    # 若非 Emoji 模式，强制物理过滤残留的图标，确保“无汞”输出
    use_emoji = "Emoji" in query or "图标" in query or "简约" in query or "代标题" in query
    if not use_emoji:
        import re
        # 移除常见的活动图标及其后的空格，但不影响正常文字
        content = re.sub(r'[⏰📍🎫✨💡📌🏷️]\s*', '', content)
        # 同时移除可能误报的“图标代标题模式”字样（如果模型输出了的话）
        content = content.replace("图标代标题模式", "").replace("Emoji Mode", "")

    print(f"\n[InspirationAnalyst FINAL OUTPUT]:\n{content}\n")
    return content, search_results
