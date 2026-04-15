# Magnes Studio — Agent 工作指南

## 这是什么项目

Magnes Studio 是一个面向小红书内容创作者的 AI 内容生产工作台。通过可视化画布（ReactFlow）编排 AI 节点（生图、文案、排版），结合 LangGraph 多智能体和 RAG 知识库，实现从灵感到可发布成图的完整流程。

## 快速定向

- **我在哪个目录？** 运行 `pwd` 确认工作目录
- **技术栈**：Python 3.10+ (FastAPI + LangGraph + SQLAlchemy) + 纯静态前端 (React 18 CDN + ReactFlow + Tailwind CSS)
- **入口文件**：后端 `backend/main.py`；前端 `frontend/index.html`
- **启动命令**：
  - 后端：`cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8088`
  - 前端：直接访问 `http://localhost:8088/magnes`（由 FastAPI 托管静态文件）
- **测试命令**：待补充（当前无统一测试入口）

## 知识库地图

在做任何修改前，先阅读相关文档：

| 我想了解... | 去读这个文件 |
|------------|-------------|
| 整体架构、模块划分 | `docs/ARCHITECTURE.md` |
| 命名规则、代码风格 | `docs/CONVENTIONS.md` |
| 技术选型原因 | `docs/TECH_DECISIONS.md` |
| 什么叫"完成" | `docs/QUALITY.md` |
| 当前进行中的计划 | `docs/exec-plans/active/` |
| 待开发功能列表 | `docs/exec-plans/backlog.md` |
| 已知技术债务 | `docs/exec-plans/tech-debt-tracker.md` |
| 产品需求与设计方案 | `prd/` 目录 |
| 系统规格说明 | `specs/` 目录 |

## 工作规范

1. **改之前先读**：修改任何模块前，先读对应的架构文档和 PRD
2. **完成即提交**：每个功能完成后立即 git commit，写清楚做了什么
3. **更新文档**：如果你的修改影响了架构或约定，同步更新 `docs/` 和 `specs/`
4. **不要猜**：看不懂的地方先读 `prd/` 和 `specs/`，文档没有再问

## 禁止事项

- 不要直接修改 `frontend/js/compiled/` 下的文件（由 Babel 编译生成）
- 不要在后端 service/agent 层引用前端 UI 组件
- 不要跳过 `backend/app/memory/` 等核心模块的数据库迁移注意事项
