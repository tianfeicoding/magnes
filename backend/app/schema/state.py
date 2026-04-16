# backend/app/schema/state.py
from typing import TypedDict, List, Optional, Any, Annotated
from langchain_core.messages import BaseMessage
import operator

def reduce_last(a: Any, b: Any) -> Any:
    """聚合器：保留最新的非空值"""
    return b if b is not None else a

def merge_dict(a: Optional[dict], b: Optional[dict]) -> Optional[dict]:
    """聚合器：合并字典内容"""
    if a is None: return b
    if b is None: return a
    return {**a, **b}

def merge_style_evolution(existing: Optional[List[dict]], new_entries: Optional[List[dict]]) -> List[dict]:
    """
    聚合器：合并 style_evolution 列表。
    - 如果是完整替换（来自 process_evolution_update_node），直接返回新列表
    - 否则（来自 style_evolve_node），追加新条目（自动去重）
    """
    if existing is None:
        existing = []
    if not new_entries:
        return existing

    # [DEBUG] 详细日志
    existing_versions = {e.get("version") for e in existing}
    new_versions = {e.get("version") for e in new_entries}
    print(f"[State Reducer DEBUG] 现有版本: {sorted(existing_versions)}, 新条目版本: {sorted(new_versions)}")
    print(f"[State Reducer DEBUG] 现有长度: {len(existing)}, 新条目长度: {len(new_entries)}")

    # 检查是否是完整替换（来自 process_evolution_update_node 的返回值）
    # 特征：新列表长度与现有列表相同，且条目 version 一致但内容不同
    if len(new_entries) == len(existing) and len(existing) > 0:
        # 可能是更新操作，检查是否只是修改了 generated_image
        is_update = True
        for i, (old, new) in enumerate(zip(existing, new_entries)):
            if old.get("version") != new.get("version"):
                is_update = False
                break
        if is_update:
            print(f"[State Reducer] 检测到更新操作，替换现有版本列表")
            return new_entries  # 完整替换

    # 去重：避免重复添加相同 version 的条目
    filtered_new = [e for e in new_entries if e.get("version") not in existing_versions]

    if filtered_new:
        print(f"[State Reducer] 追加 {len(filtered_new)} 个新版本: {[e.get('version') for e in filtered_new]}")
    else:
        print(f"[State Reducer] 没有新版本需要追加")

    # 追加新条目（去重后）
    return existing + filtered_new

class MagnesState(TypedDict):
    """
    Magnes 系统的核心状态字典。
    """
    
    # 1. 基础对话流
    messages: List[BaseMessage]
    
    # 用户原始指令
    instruction: str
    
    # 2. 用户意图提取结果
    intent: Optional[dict]
    
    # 3. 设计产出 (由各个智能体节点协作填充)
    # 使用 Annotated[..., operator.add] 或自定义 reducer 实现并行节点的输出自动合并
    layout_schema: Annotated[Optional[dict], merge_dict]
    visual_assets: Annotated[List[str], operator.add]
    background_url: Optional[str]   # Painter 生成的纯净背景 URL
    
    # 多智能体协作新字段
    user_prompt: Optional[str]     # 前端传来的手动生图提示词
    run_painter: Optional[bool]    # 是否运行 Painter 节点 (背景重绘)
    run_refiner: Optional[bool]    # 是否运行 Refiner 节点 (视觉分析 - 兼容旧版)
    run_layout_analyzer: Optional[bool] # 是否运行布局分析
    run_style_analyzer: Optional[bool]  # 是否运行风格分析
    run_style_evolve: Optional[bool]    # 是否运行风格演化
    run_style_critic: Optional[bool]    # 是否运行风格验证评分

    style_learning: Annotated[Optional[str], reduce_last]  # 语义解析材料 (全文)
    style_prompt: Annotated[Optional[str], reduce_last]    # 精确生图 Prompt (兼容旧版)
    prompt_text_zh: Annotated[Optional[str], reduce_last]  # 中文提示词 (给用户展示)
    prompt_text_en: Annotated[Optional[str], reduce_last]  # 英文提示词 (给生图模型)
    style_genome: Annotated[Optional[dict], merge_dict]    # 结构化美学基因
    style_evolution: Annotated[List[dict], merge_style_evolution]   # 提示词演化历史（支持追加和更新）
    critic_report: Annotated[Optional[dict], reduce_last] # 视觉审计报告 (ReAct 观测项)
    evolution_count: Annotated[int, operator.add]          # 演化循环计数
    background_color: Optional[str]                        # 提取的背景色
    evolved_version: Annotated[Optional[int], reduce_last] # 当前演化版本号，用于关联生成的图片
    style_evolution_update: Annotated[Optional[dict], reduce_last]  # 用于更新 style_evolution 的标记
    evaluation_mode: Annotated[Optional[str], reduce_last] # 评分模式：clone（还原度）或 evolution（创作质量）

    active_skill: Optional[str]    #当前执行的业务技能 ID (如: rednote-cover-design)
    
    # 4. 任务控制元数据
    # 为避免并行冲突，current_step 使用 reduce_last 聚合
    current_step: Annotated[str, reduce_last]          # 当前进行到哪一步
    task_id: Optional[str]     # 异步任务的唯一标识
    is_completed: bool         # 整个创作流是否已结束

