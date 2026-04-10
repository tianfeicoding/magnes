"""
API Endpoints Router
聚合所有子模块路由的入口文件。
在这里统一注册 API 路径，供 main.py 挂载使用。
"""
from fastapi import APIRouter
from app.api import history_routes, task_routes, template_routes, prompt_routes

router = APIRouter()

# 挂载各子模块路由
router.include_router(history_routes.router)
router.include_router(task_routes.router)
router.include_router(template_routes.router)
router.include_router(prompt_routes.router)
