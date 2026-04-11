# backend/main.py
import uvicorn
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security, Depends, HTTPException, status
import os
import logging

# [日志优化] 过滤掉前端静态 JS 文件的 200 OK 正常访问日志
class JSLogFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # 屏蔽路径列表：匹配成功的静态资源或已知可忽略的请求路径
        is_static_path = any(p in msg for p in ["/js/", "/src/", "/core/", "/research/", "/css/", "/skills_assets/", "/uploads/", "/.well-known/", "/sm/"])
        # 覆盖常见静态文件后缀 (忽略大小写)
        is_static_ext = any(ext in msg.lower() for ext in [".js", ".css", ".map", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".ico", ".woff", ".woff2"])
        
        # 同时过滤 200 OK 和 404 Not Found (这些对静态资源和 Source Maps 来说通常是噪音)
        is_ignored_status = any(s in msg for s in [" 200 ", " 404 "])
        
        if (is_static_path or is_static_ext) and is_ignored_status:
            return False
        return True

# 立即应用到所有可能的 uvicorn 日志器
for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(logger_name).addFilter(JSLogFilter())

# 获取当前 main.py 所在的 backend 目录路径
backend_dir = os.path.dirname(os.path.abspath(__file__))
# 显式加载该目录下的 .env 文件
load_dotenv(os.path.join(backend_dir, ".env"))

from app.core.database import engine, Base
from app.api.template_routes import router as template_router
from app.api.history_routes import router as history_router
from app.api.task_routes import router as task_router
from app.api.mcp_routes import router as mcp_router
from app.api.prompt_routes import router as prompt_router
from app.api.dialogue_routes import router as dialogue_router  # [Phase 1] 对话模式
from app.api.rag_routes import router as rag_router, public_router as public_rag_router # [Phase 2] RAG 知识库
from app.api.export_routes import router as export_router      # [NEW] 图片导出
from app.api.auth_routes import router as auth_router          # [NEW] 安全认证

# [启动自检] 检查环境变量是否加载成功
if os.getenv("API_KEY"):
    print(f"🚀 Magnes 启动成功 (v1.1)！已检测到 API_KEY: {os.getenv('API_KEY')[:6]}...")
else:
    print("❌ 警告：未检测到 API_KEY，请检查 backend/.env 文件位置！")

# 数据定义：前端发过来的请求包
class DesignRequest(BaseModel):
    thread_id: str             # 用于标记不同的设计会话（数据库存档点）
    instruction: str            # 用户的业务指令（如“拆分图层”）
    image_url: Optional[str] = None # 前端传过来的图片 URL
    user_prompt: Optional[str] = None # 手动生图提示词
    num_layers: Optional[int] = 4    # 图层拆解数量
    run_painter: Optional[bool] = False # 是否运行 Painter 节点 (背景重绘)
    run_refiner: Optional[bool] = True  # 是否运行 Refiner 节点 (文字建模)
    canvas_width: Optional[int] = None  # 原始画布宽度
    canvas_height: Optional[int] = None # 原始画布高度


# 保存全局应用实例
magnes_app = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """管理 FastAPI 的生命周期，确保工作流在启动时初始化"""
    global magnes_app

    # 0. 强力注入日志过滤器到 Logger 和 Handler (针对 Uvicorn Reload 机制)
    js_filter = JSLogFilter()
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        log = logging.getLogger(logger_name)
        # 避免重复添加过滤器
        if not any(isinstance(f, JSLogFilter) for f in log.filters):
            log.addFilter(js_filter)
        for h in log.handlers:
            if not any(isinstance(f, JSLogFilter) for f in h.filters):
                h.addFilter(js_filter)
    
    # 1. 自动创建数据库表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("📋 数据库表初始化完成")

    # 2. 初始化 Designer 工作流
    from app.core.workflow import create_workflow
    magnes_app = await create_workflow()
    
    # 3. 初始化对话 Planner 异步图 (带 SQLite 持久化)
    from app.agents.planner import init_planner_graph
    _, planner_memory_context = await init_planner_graph()
    
    # 4. 初始化 RAG 模块：LlamaIndex, ChromaDB 和 BM25 索引
    from app.rag.vectorstore.chroma_store import get_xhs_collection, get_gallery_collection
    from app.rag.retrieval.bm25_retriever import get_bm25_index
    from app.rag import init_rag_settings
    try:
        # LlamaIndex 全局配置初始化
        init_rag_settings()
        
        get_xhs_collection()      # 触发 ChromaDB 初始化
        get_gallery_collection()
        bm25 = get_bm25_index()
        bm25.load()               # 加载已持久化的 BM25 索引
        print("📚 RAG 模块初始化完成（LlamaIndex + ChromaDB + BM25）")
    except Exception as e:
        print(f"⚠️ RAG 模块初始化失败（不影响主程序）: {e}")
    
    yield
    
    # 关闭持久化连接
    if 'planner_memory_context' in locals() and planner_memory_context:
        await planner_memory_context.__aexit__(None, None, None)
    # 这里可以添加关闭数据库连接的逻辑（如有需要）



app = FastAPI(title="Magnes Studio API", version="1.0.0", lifespan=lifespan)

# --- Security & Authentication ---

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """验证 Bearer Token 鉴权"""
    expected_token = os.getenv("MAGNES_API_TOKEN")
    
    if not expected_token:
        print("⚠️ 警告: 未设置 MAGNES_API_TOKEN，后端处于无鉴权运行状态")
        return None
        
    if credentials.credentials != expected_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing Magnes API Token"
        )
    return credentials.credentials

# Hamilton: 解决 CORS (跨域资源共享) 问题
# 显式允许 file:// 协议产生的 null origin (如果需要支持 file://)
# 生产环境下应严格限制为前端部署域名
    # 构造 LangGraph 的初始状态
    app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173", "http://127.0.0.1:8088", "http://101.35.231.206", "http://magnes.online", "https://magnes.online", "http://www.magnes.online", "https://www.magnes.online"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    )
    initial_input = {
        "messages": [("user", request.instruction)],
        "instruction": request.instruction,
        "user_prompt": request.user_prompt, 
        "run_painter": request.run_painter, 
        "run_refiner": request.run_refiner, 
        "intent": {
            "image_url": request.image_url,
            "topic": request.instruction,
            "num_layers": request.num_layers,
            "width": request.canvas_width,
            "height": request.canvas_height
        },
        "current_step": "initializing",
        "is_completed": False,
        "visual_assets": [],
        "style_learning": None
    }
    
    # 执行工作流 (带上 thread_id 进数据库存档)
    if not magnes_app:
        return {"status": "error", "message": "Workflow not initialized"}
        
    config = {"configurable": {"thread_id": request.thread_id}}
    
    # 运行并等待结果
    result = await magnes_app.ainvoke(initial_input, config=config)
    
    return {
        "thread_id": request.thread_id,
        "status": "success",
        "current_step": result.get("current_step"),
        "output": result.get("layout_schema")
    }

# --- 挂载业务路由 (带鉴权依赖) ---
common_deps = [Depends(verify_token)]

app.include_router(template_router, prefix="/api/v1", dependencies=common_deps)
app.include_router(history_router, prefix="/api/v1", dependencies=common_deps)
app.include_router(task_router, prefix="/api/v1", dependencies=common_deps)
app.include_router(mcp_router, prefix="/api/v1", dependencies=common_deps)
app.include_router(prompt_router, prefix="/api/v1", dependencies=common_deps)
app.include_router(dialogue_router, prefix="/api/v1", dependencies=common_deps)  # [Phase 1] 对话模式 SSE
app.include_router(public_rag_router, prefix="/api/v1")                         # [Phase 2] RAG 公共接口 (图片等)
app.include_router(rag_router, prefix="/api/v1", dependencies=common_deps)       # [Phase 2] RAG 业务接口
app.include_router(export_router, prefix="/api/v1", dependencies=common_deps)    # [NEW] 图片导出
app.include_router(auth_router, prefix="/api/v1")                               # [NEW] 安全认证 (不带通用 Bearer 鉴权，由内部管理)

# --- 挂载静态文件 (Frontend) ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# 静态资源 (js, css, fonts 等)
app.mount("/", StaticFiles(directory=os.path.join(backend_dir, "../frontend"), html=True), name="frontend")
app.mount("/", StaticFiles(directory=os.path.join(backend_dir, "../frontend"), html=True), name="frontend")
app.mount("/js", StaticFiles(directory=os.path.join(backend_dir, "../frontend/js")), name="js")
app.mount("/css", StaticFiles(directory=os.path.join(backend_dir, "../frontend/css")), name="css")
app.mount("/core", StaticFiles(directory=os.path.join(backend_dir, "../frontend/core")), name="core")
# app.mount("/research", StaticFiles(directory=os.path.join(backend_dir, "../frontend/research")), name="research")
app.mount("/src", StaticFiles(directory=os.path.join(backend_dir, "../frontend/src")), name="src")
app.mount("/.well-known", StaticFiles(directory=os.path.join(backend_dir, "../frontend/.well-known")), name="well-known")

# [持久化存储] 挂载本地上传目录
uploads_dir = os.path.join(backend_dir, "data/uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# [技能资源] 挂载 .agent 目录以便访问技能素材
agent_dir = os.path.abspath(os.path.join(backend_dir, "../.agent"))
if os.path.exists(agent_dir):
    app.mount("/skills_assets", StaticFiles(directory=agent_dir), name="skills_assets")

# 页面路由 - 显式映射 rag.html
@app.get("/rag.html")
async def serve_rag():
    return FileResponse(os.path.join(backend_dir, "../frontend/rag.html"))

# 默认首页 (Magnes)
@app.get("/magnes")
async def serve_magnes():
    return FileResponse(os.path.join(backend_dir, "../frontend/index.html"))

if __name__ == "__main__":
    # [官方推荐] 通过 log_config 彻底过滤访问日志
    from uvicorn.config import LOGGING_CONFIG
    import copy

    # 深拷贝默认配置避免修改全局配置
    log_config = copy.deepcopy(LOGGING_CONFIG)

    # 注入自定义过滤器类
    log_config["filters"] = log_config.get("filters", {})
    log_config["filters"]["js_filter"] = {"()": "main.JSLogFilter"}

    # 挂载到访问日志处理器
    if "access" in log_config.get("handlers", {}):
        log_config["handlers"]["access"]["filters"] = ["js_filter"]

    uvicorn.run("main:app", host="0.0.0.0", port=8088, reload=True, log_config=log_config)
