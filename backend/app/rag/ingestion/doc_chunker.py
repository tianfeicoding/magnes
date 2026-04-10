"""
doc_chunker.py - 父子双层智能分块引擎
将 ParsedDocument 拆分为 Parent Chunk (1500字) 和 Child Chunk (300字)。

分块策略：
1. 语义边界感知：优先在标题（H1/H2/H3）和段落换行处切分
2. 重叠窗口：相邻 Child 间有 50 字重叠，防止语义断裂
3. 表格/图片保护：表格和图片描述不被切断，独立成块
4. 元数据继承：每个 Chunk 自动继承文件名、页码、标题路径
"""
import hashlib
import re
from typing import List, Callable, Any
from pydantic import Field

from llama_index.core import Document as LlamaDocument
from llama_index.core.node_parser import (
    NodeParser, SentenceSplitter, SemanticSplitterNodeParser, 
    HTMLNodeParser, MarkdownNodeParser
)
from llama_index.core.utils import get_tokenizer

from app.rag.ingestion.doc_parser import ParsedDocument, Section
from app.rag.models.knowledge_document import KnowledgeChunk
from app.rag.vectorstore.embedder import MagnesEmbedding
from app.rag.config import (
    PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_OVERLAP,
    SEMANTIC_BREAKPOINT_THRESHOLD, SEMANTIC_BUFFER_SIZE, HYBRID_MAX_CHUNK_SIZE,
    HEADING_ROUTING_THRESHOLD, PROPOSITION_EXTRACTION_THRESHOLD,
    get_llm
)

# --- 命题提取提示词 ---
PROPOSITIONS_PROMPT = """
你是一个顶尖的内容分析专家，擅长从任何密集的文本中挖掘出「不漏掉任何细节」的事实命题。

请将提供的文本内容（Content）分解为清晰、简单且自包含的“命题”（Propositions）。

要求：
1. **全面性（CRITICAL）**：必须提取出 Content 中包含的所有独立事实、时间点、地点、数值、要求和实体信息。请务必审读到文本的最后一个字符，不得遗漏文档后半部分的任何实质性细节。
2. 将复合句拆分为简单句。尽可能保留原始表达。
3. 去上下文依赖：将代词替换为它们所指代的实体的全称，使命题自包含。
4. 如果内容包含表格或列表，请确保每个条目都转化成独立的命题。
5. 结果以 JSON 字符串列表形式呈现。

Input文本: {node_text}
输出 (仅 JSON 格式，不含解释):
"""

# --- 全局摘要提示词 ---
GLOBAL_SUMMARY_PROMPT = """
你是一个专业的文档分析官。请阅读以下文档的开头部分，并为整篇文档生成：
1. **全局摘要**：100 字以内的精炼描述，说明文档的核心主题和用途。
2. **核心标签**：5 个能代表文档实质内容的专业标签。请重点关注并提取以下维度：
   - **文档类型**（如：brief、方案、手册、规范）
   - **品牌/实体名称**（如：小红书、具体的品牌名）
   - **核心活动/场景**（如：视频拍摄、开业活动、直播）
   - **业务目标**（如：品牌推广、转化提升）
   - 注意：这些标签主要用于跨文档检索，应尽量客观、专业，且不应仅局限于通用词汇。

请严格以 JSON 格式输出：
{{
  "summary": "...",
  "tags": ["tag1", "tag2", ...]
}}

文档内容：
{doc_text}
"""


# --- 中文分句与混合解析器 (Hybrid Node Parser) ---

def chinese_sentence_tokenizer(text: str) -> List[str]:
    """针对中文优化的分句函数，配合 SemanticSplitter 使用"""
    sentences = re.findall(r'[^。！？…\n]+[。！？…\n]?', text)
    return [s.strip() for s in sentences if s.strip()]


class HybridNodeParser(NodeParser):
    """
    自研混合切分引擎：
    1. 第一级：语义切分 (Semantic) -> 寻找逻辑连贯的段落
    2. 第二级：滑动窗口 (Window) -> 针对超长段落进行 Token 对齐
    """
    primary_parser: NodeParser
    secondary_parser: NodeParser
    max_chunk_size: int = HYBRID_MAX_CHUNK_SIZE
    tokenizer: Callable = Field(default_factory=get_tokenizer, exclude=True)

    async def _aparse_nodes(self, nodes: List[LlamaDocument], **kwargs) -> List[Any]:
        print(f"\n[HybridParser] --- 开始执行【异步混合语义切分】(文档数: {len(nodes)}) ---")
        
        # 1. 第一步：利用 LlamaIndex 的异步接口获取粗切后的语义节点
        # 注意：SemanticSplitterNodeParser 在 aget_nodes_from_documents 时会发起异步 Embedding 请求
        primary_nodes = await self.primary_parser.aget_nodes_from_documents(nodes)
        print(f"[HybridParser] 第一步(语义/结构切分)完成，得到 {len(primary_nodes)} 个初始段落。")
        
        final_nodes = []
        for i, node in enumerate(primary_nodes, 1):
            node_content = node.get_content()
            tokens = self.tokenizer(node_content)
            node_size = len(tokens)
            
            # 路由预判层 (Selective Splitting)
            # 策略：如果不处理语义复杂或超大的块，直接降级处理以节省 Embedding 消耗
            is_complex = node_size > self.max_chunk_size
            
            print(f"[HybridParser] >>> 检查段落 {i}/{len(primary_nodes)} (大小: {node_size} tokens)...", end="")
            
            if not is_complex:
                print(" [核心短块: 快速通过]")
                final_nodes.append(node)
            else:
                print(f" [路由触发: 超大/复杂块执行二次切片]")
                # 针对超大块，使用 SentenceSplitter 进行滑动窗口物理对齐
                sub_nodes = self.secondary_parser.get_nodes_from_documents([LlamaDocument(text=node_content)])
                print(f"    └── 二次切分完成, 得到 {len(sub_nodes)} 个子块。")
                for sn in sub_nodes:
                    sn.metadata.update(node.metadata)
                final_nodes.extend(sub_nodes)
                
        print(f"[HybridParser] --- 【异步混合分块】全部完成, 最终生成 {len(final_nodes)} 节点 ---\n")
        return final_nodes

    async def aget_nodes_from_documents(self, documents: List[LlamaDocument], **kwargs) -> List[Any]:
        """[升级 6.0] 覆盖异步入口，直接调度内部异步切分"""
        return await self._aparse_nodes(documents, **kwargs)

    def _parse_nodes(self, nodes: List[LlamaDocument], **kwargs) -> List[Any]:
        """同步回退：通常由 get_nodes_from_documents 调度"""
        import asyncio
        import nest_asyncio
        nest_asyncio.apply() # 解决在已有循环中运行的问题
        return asyncio.get_event_loop().run_until_complete(self._aparse_nodes(nodes))


class PropositionExtractor:
    """原子化命题提取器：利用 LLM 将段落转化为高精度的原子事实节点"""
    def __init__(self, llm=None):
        self._llm = llm
        self._initialized = False

    def _ensure_initialized(self):
        """延迟初始化，避免在实例化时阻塞"""
        if not self._initialized:
            self._llm = self._llm or get_llm()
            # 提升命题提取的输出上限，确保长文档不被截断
            if hasattr(self._llm, "max_tokens"):
                self._llm.max_tokens = 2048
            self._initialized = True
        return self._llm

    @property
    def llm(self):
        return self._ensure_initialized()

    async def aextract(self, text: str) -> List[str]:
        """异步提取命题"""
        import json
        try:
            prompt = PROPOSITIONS_PROMPT.format(node_text=text)
            response = await self.llm.acomplete(prompt)
            content = response.text.strip()
            
            # 清理 JSON 处理
            if "```json" in content:
                content = content.split("```json")[-1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[-1].split("```")[0].strip()
                
            propositions = json.loads(content)
            if isinstance(propositions, list):
                return [str(p) for p in propositions if p]
            return []
        except Exception as e:
            # 增加对 502/504 的指数退避重试逻辑 (模拟实现，暂不引入复杂 retry 库)
            print(f"[PropositionExtractor] ⚠️ 提取失败: {e}")
            return []


class GlobalSummarizer:
    """全局摘要提取器：为整篇文档生成统一的背景概要和标签"""
    def __init__(self, llm=None):
        self._llm = llm
        self._initialized = False

    def _ensure_initialized(self):
        """延迟初始化，避免在实例化时阻塞"""
        if not self._initialized:
            self._llm = self._llm or get_llm()
            self._initialized = True
        return self._llm

    @property
    def llm(self):
        return self._ensure_initialized()

    async def summarize(self, text: str) -> dict:
        """异步生成摘要和标签"""
        import json
        # 取前 4000 个字符进行摘要，避免超长
        sample_text = text[:4000]
        try:
            prompt = GLOBAL_SUMMARY_PROMPT.format(doc_text=sample_text)
            response = await self.llm.acomplete(prompt)
            content = response.text.strip()
            
            if "```json" in content:
                content = content.split("```json")[-1].split("```")[0].strip()
            
            data = json.loads(content)
            return {
                "summary": data.get("summary", "无摘要"),
                "tags": data.get("tags", [])
            }
        except Exception as e:
            print(f"[GlobalSummarizer] ⚠️ 摘要提取失败: {e}")
            return {"summary": "", "tags": []}


def _split_text_by_size(text: str, max_size: int, overlap: int = 0) -> List[str]:
    """
    按大小切分文本，优化滑动窗口逻辑，防止出现重复度过高的“蠕动式”切分。
    """
    if len(text) <= max_size:
        return [text]

    chunks = []
    start = 0
    seen_contents = set()

    while start < len(text):
        # 目标结束位置
        end = min(start + max_size, len(text))
        
        # 尝试寻找自然断句点（仅在非末尾时回退）
        if end < len(text):
            # 限制回退范围，最多回退 30%，防止 start 停滞不前
            lookback_limit = max(start + 1, end - int(max_size * 0.3))
            found_sep = False
            for sep in ['\n\n', '\n', '。', '！', '？', '；']:
                last_sep = text.rfind(sep, lookback_limit, end)
                if last_sep > start:
                    end = last_sep + len(sep)
                    found_sep = True
                    break
            
            # 如果没找到中文标点，再试英文/空格
            if not found_sep:
                for sep in ['. ', '! ', '? ', '; ', ' ']:
                    last_sep = text.rfind(sep, lookback_limit, end)
                    if last_sep > start:
                        end = last_sep + len(sep)
                        break

        chunk = text[start:end].strip()
        
        # 简单的内容查重（同一文档内）
        if chunk and chunk not in seen_contents:
            chunks.append(chunk)
            seen_contents.add(chunk)

        # 计算下一块起始位置
        # 如果当前块太短（小于 overlap），则强行不重叠，从当前 end 开始
        if end - start <= overlap:
            start = end
        else:
            # 正常滑动，确保 start 至少比之前往前走了
            next_start = end - overlap
            if next_start <= start:
                start = end
            else:
                start = next_start
                
    return chunks


async def chunk_document_with_llama(
    parsed: ParsedDocument,
    doc_id: str,
    category: str = "通用"
) -> List[KnowledgeChunk]:
    """
    使用升级版 HybridNodeParser 实现高精度分块
    策略：
    1. 使用 SemanticSplitter 进行初步语义划分
    2. 针对过大段落使用 SentenceSplitter 滑动窗口对齐
    3. 映射回项目原有的 Parent-Child 结构
    """
    print(f"[DocChunker] 开始升级版混合分块: {parsed.filename}")

    # 1. 初始化组件
    print("[DocChunker] 🚀 正在初始化 MagnesEmbedding...")
    embed_model = MagnesEmbedding()
    print("[DocChunker] ✅ MagnesEmbedding 初始化完成")
    
    # 针对 HTML/Markdown 文档使用专门的结构解析器进行“粗切”
    if parsed.file_type == "html":
        print(f"[DocChunker] 🌐 检测到 HTML 格式，使用 HTMLNodeParser 保护结构...")
        primary_parser = HTMLNodeParser(tags=["p", "h1", "h2", "h3", "h4", "table", "li"])
    elif parsed.file_type in ["md", "markdown"] or parsed.full_text.lstrip().startswith("#"):
        print(f"[DocChunker] 📝 检测到 Markdown 格式，使用 MarkdownNodeParser 保护结构...")
        primary_parser = MarkdownNodeParser()
    else:
        primary_parser = SemanticSplitterNodeParser(
            buffer_size=SEMANTIC_BUFFER_SIZE,
            breakpoint_percentile_threshold=SEMANTIC_BREAKPOINT_THRESHOLD,
            sentence_splitter=chinese_sentence_tokenizer,
            embed_model=embed_model
        )

    window_parser = SentenceSplitter(
        chunk_size=PARENT_CHUNK_SIZE,
        chunk_overlap=CHILD_OVERLAP,
        tokenizer=get_tokenizer()
    )
    hybrid_parser = HybridNodeParser(
        primary_parser=primary_parser,
        secondary_parser=window_parser,
        max_chunk_size=HYBRID_MAX_CHUNK_SIZE
    )

    # 提取全局摘要和标签
    print("[DocChunker] 🚀 正在初始化 GlobalSummarizer...")
    summarizer = GlobalSummarizer()
    print("[DocChunker] ✅ GlobalSummarizer 初始化完成，开始生成摘要...")
    global_info = await summarizer.summarize(parsed.full_text)
    global_summ = global_info["summary"]
    global_tags = global_info["tags"]
    print(f"[DocChunker] ✨ 已生成全局摘要: {global_summ[:50]}...")

    # 执行全局节点生成
    # 结构优先路由：如果 Section 本身逻辑完整且长度适中，直接作为 Node 处理
    nodes_to_process = []
    
    # 针对 PDF/Word 等已经根据标题分好 Section 的文档
    if parsed.sections and parsed.file_type not in ["html", "md"]:
        print(f"[DocChunker] 🏗️ 检测到结构化 Section，启用标题优先路由流程...")
        for sec in parsed.sections:
            sec_len = len(sec.content)
            # 如果内容本身长度适中（低于 HEADING_ROUTING_THRESHOLD），直接作为一个节点，不再经过语义切分器
            if sec_len < HEADING_ROUTING_THRESHOLD:
                meta = {"page_num": sec.page_num, "heading": sec.heading or ""}
                nodes_to_process.append(LlamaDocument(text=sec.content, metadata=meta))
            else:
                # 针对超长 Section，仍需经过物理/语义切分
                print(f"  └── 章节 '{sec.heading[:20]}...' 过长 ({sec_len}字)，将进行二次语义切分")
                sub_nodes = await hybrid_parser.aget_nodes_from_documents([
                    LlamaDocument(text=sec.content, metadata={"page_num": sec.page_num, "heading": sec.heading or ""})
                ])
                nodes_to_process.extend(sub_nodes)
    else:
        # 其他未结构化文档保持原有 Hybrid 流程
        llama_docs = [LlamaDocument(text=s.content, metadata={"page_num": s.page_num, "heading": s.heading or ""}) for s in parsed.sections if s.content.strip()]
        nodes_to_process = await hybrid_parser.aget_nodes_from_documents(llama_docs)

    all_chunks: List[KnowledgeChunk] = []
    import asyncio
    print("[DocChunker] 🚀 正在初始化 PropositionExtractor...")
    extractor = PropositionExtractor()
    print("[DocChunker] ✅ PropositionExtractor 初始化完成")
    semaphore = asyncio.Semaphore(5) # 降低至 5，减轻 API 负载，减少 502 概率
    
    print(f"[DocChunker] 🧠 正在为 {len(nodes_to_process)} 个分块执行原子命题提取预判...")

    # 记录已处理的图片 ID，避免重复归入
    processed_image_ids = set()

    async def _process_node(node, seq_num):
        heading = node.metadata.get("heading", "")
        heading_path = heading
        full_heading_path = f"{parsed.filename} > {heading_path}" if heading_path else parsed.filename
        
        parent_id = f"{doc_id}_p{seq_num}"
        parent_content = node.get_content()
        
        node_chunks = []
        # 添加父级语义块 (作为 Context)
        node_chunks.append(KnowledgeChunk(
            chunk_id=parent_id,
            doc_id=doc_id,
            parent_chunk_id=None,
            chunk_type="parent",
            content=parent_content,
            page_num=node.metadata.get("page_num", 1),
            heading_path=full_heading_path,
            seq=seq_num,
            filename=parsed.filename,
            category=category,
            global_summary=global_summ,
            global_tags=global_tags
        ))
        
        # 选择性命题提取 (Selective Propositions)
        # 核心逻辑：只有内容足够丰富（大于 PROPOSITION_EXTRACTION_THRESHOLD）或包含结构化列表时，才触发极其粉碎的原子化拆分
        should_split_props = len(parent_content) > PROPOSITION_EXTRACTION_THRESHOLD or any(sym in parent_content for sym in ["•", "1.", "2.", "3.", "* "])

        if should_split_props:
            # 保护性并发提取命题
            async with semaphore:
                props = await extractor.aextract(parent_content)
            
            # 降级兜底逻辑 —— 如果 AI 提取失败或返回为空，强制进行物理切分
            if not props:
                print(f"[DocChunker] 🛠 AI 提取器未返回内容，执行保底物理切片 (窗口大小: {CHILD_CHUNK_SIZE})...")
                props = _split_text_by_size(parent_content, CHILD_CHUNK_SIZE, CHILD_OVERLAP)

            for p_idx, p_text in enumerate(props):
                node_chunks.append(KnowledgeChunk(
                    chunk_id=f"{parent_id}_prop_{p_idx}",
                    doc_id=doc_id,
                    parent_chunk_id=parent_id,
                    chunk_type="child",
                    content=p_text,
                    page_num=node.metadata.get("page_num", 1),
                    heading_path=full_heading_path,
                    seq=seq_num,
                    filename=parsed.filename,
                    category=category,
                    global_summary=global_summ,
                    global_tags=global_tags
                ))
        
        # --- [就近关联] 将属于当前标题的图片插入该章节之后 ---
        for i, img in enumerate(parsed.images):
            # [优化] 使用更宽松的标题匹配 (移除空白符干扰)
            img_h = img.section_heading.strip()
            node_h = heading.strip()
            if img.image_id not in processed_image_ids and (img_h == node_h or node_h in img_h or img_h in node_h):
                # [FIX] 无论是否有描述，都必须创建父分块展示“视觉原文”
                parent_img_id = f"{doc_id}_img_p_{i}_{seq_num}"
                node_chunks.append(KnowledgeChunk(
                    chunk_id=parent_img_id,
                    doc_id=doc_id,
                    parent_chunk_id=None,
                    chunk_type="image_parent",
                    content=f"[图片内容] 文档插图 ID: {img.image_id}",
                    page_num=img.page_num,
                    heading_path=f"{parsed.filename} > {heading} (插图)",
                    seq=seq_num,
                    filename=parsed.filename,
                    category=category,
                    global_summary=global_summ,
                    global_tags=global_tags,
                    image_path=img.local_path
                ))
                
                # 只有当成功生成了描述/OCR 时，才创建子分块
                if img.description:
                    node_chunks.append(KnowledgeChunk(
                        chunk_id=f"{doc_id}_img_c_{i}_{seq_num}",
                        doc_id=doc_id,
                        parent_chunk_id=parent_img_id,
                        chunk_type="image_child",
                        content=img.description,
                        page_num=img.page_num,
                        heading_path=f"{parsed.filename} > {heading} (描述)",
                        seq=seq_num,
                        filename=parsed.filename,
                        category=category,
                        global_summary=global_summ,
                        global_tags=global_tags
                    ))
                processed_image_ids.add(img.image_id)
        
        return node_chunks

    # 执行并发任务
    tasks = [_process_node(node, i) for i, node in enumerate(nodes_to_process)]
    results = await asyncio.gather(*tasks)
    
    # 扁平化结果
    for node_result in results:
        all_chunks.extend(node_result)
    
    # --- 处理剩余图片 (未关联到特定标题的) ---
    current_seq = len(nodes_to_process) + 1
    for i, img in enumerate(parsed.images):
        if img.image_id not in processed_image_ids:
            parent_img_id = f"{doc_id}_img_p_{i}_final"
            # 1. 父块 (原文)
            all_chunks.append(KnowledgeChunk(
                chunk_id=parent_img_id,
                doc_id=doc_id,
                parent_chunk_id=None,
                chunk_type="image_parent",
                content=f"[图片内容] 独立配图 ID: {img.image_id}",
                page_num=img.page_num,
                heading_path=f"{parsed.filename} (分录图片)",
                seq=current_seq,
                filename=parsed.filename,
                category=category,
                global_summary=global_summ,
                global_tags=global_tags,
                image_path=img.local_path
            ))
            # 2. 子块 (仅在有描述时)
            if img.description:
                all_chunks.append(KnowledgeChunk(
                    chunk_id=f"{doc_id}_img_c_{i}_final",
                    doc_id=doc_id,
                    parent_chunk_id=parent_img_id,
                    chunk_type="image_child",
                    content=img.description,
                    page_num=img.page_num,
                    heading_path=f"{parsed.filename} (图片描述)",
                    seq=current_seq,
                    filename=parsed.filename,
                    category=category,
                    global_summary=global_summ,
                    global_tags=global_tags
                ))
            current_seq += 1
            processed_image_ids.add(img.image_id)

    return all_chunks
