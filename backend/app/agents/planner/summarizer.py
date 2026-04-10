"""
对话内容摘要节点
当消息历史过长时，自动触发摘要生成以压缩上下文并保留关键意图。
"""
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, RemoveMessage, BaseMessage
from .state import PlannerState

async def summarize_conversation(state: PlannerState):
    """自动摘要节点：当消息过长时，压缩旧消息并保留意图"""
    print("--- [Summarizer] 节点开始检查 ---", flush=True)
    messages = state["messages"]
    
    if len(messages) <= 20:
        print("--- [Summarizer] 消息量正常，跳过摘要 ---", flush=True)
        return {}

    print(f"\n[Summarizer] 🧹 侦测到对话过长 ({len(messages)} 条)，正在执行自动压缩...")
    
    from .planner_agent import get_planner_llm
    llm = await get_planner_llm()
    
    summary_prompt = (
        "你是一个记忆管理器。请根据以下对话历史，总结出重点的设计意图、配色偏好、品牌调性以及用户已确认的技术决策。"
        "摘要需简洁明了，仅保留对后续生成至关重要的事实信息。使用中文。"
    )
    
    summary_input = messages[:-6] 
    response = await llm.ainvoke([
        SystemMessage(content=summary_prompt),
        HumanMessage(content=f"请总结以下对话：\n{messages_to_prompt(summary_input)}")
    ])
    
    new_summary = response.content
    print(f"[Summarizer] ✅ 摘要生成成功: {new_summary[:50]}...")

    return {
        "conversation_summary": new_summary,
        "messages": [RemoveMessage(id=m.id) for m in summary_input] 
    }

def messages_to_prompt(messages: list[BaseMessage]) -> str:
    """将消息列表转换为纯文本字符串供摘要使用"""
    res = []
    for m in messages:
        role = "用户" if isinstance(m, HumanMessage) else "助手"
        res.append(f"{role}: {m.content}")
    return "\n".join(res)
