<div align="center">

# ✦ Magnes ✦

**AI 驱动的小红书内容生产工作台**

*从灵感到成图，一个画布完成全部流程*

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-black?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-black?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-black?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![React](https://img.shields.io/badge/React-18-black?logo=react&logoColor=white)](https://react.dev)

</div>

---

## 目录

- [项目简介](#-项目简介)
- [核心特性](#-核心特性)
- [技术架构](#-技术架构)
- [快速开始](#-快速开始)
- [环境变量配置](#-环境变量配置)
- [项目结构](#-项目结构)
- [多智能体工作流](#-多智能体工作流)
- [RAG 知识库系统](#-rag-知识库系统)
- [开发指南](#-开发指南)
- [User Journey](#-user-journey)

---

## 🧲 项目简介

**Magnes** 是一个面向小红书内容创作者、品牌电商运营团队和内容工作室的 AI 内容生产平台。

通过可视化的 **ReactFlow 工作流画布**和右侧常驻的 **AI 对话助手**，将内容策划、AI 生图、排版合成、文案生成等环节整合到同一个界面，配合 **LangGraph 多智能体系统**和 **RAG 品牌知识库**，实现从灵感输入到可发布成图的完整自动化流程。

**解决的核心问题**：
- 内容生产工具割裂——文案工具、生图工具、排版工具各自独立
- 批量生产效率低——大量重复性工作依赖人工
- 品牌一致性难保障——多人协作风格不统一，缺乏知识沉淀机制

---

## ✨ 核心特性

| 模块 | 能力 |
|------|------|
| 💬 **AI 对话助手** | 右侧常驻对话面板，自然语言驱动画布节点创建与任务执行 |
| 🎨 **可视化工作流画布** | 拖拽式节点编排，实时预览每个 AI 步骤的输出 |
| 🤖 **中心化多智能体** | Router + Designer + Creative + Knowledge 4 大 Agent 调度，9 大 Expert 执行 |
| ⚙️ **精细编排节点** | 像素级调整图层、文字、配色，支持多版本对比与高清导出 |
| 🖼️ **AI 生图集成** | 支持 Nano-Banana 2（即梦）/ DALL-E 3 双引擎，一键替换背景与场景 |
| 🔄 **提示词自迭代** | AI 反推参考图风格 Prompt，自动迭代优化直到输出满意结果 |
| 🛒 **商品图生成 Skill** | 上传白底商品图，自动识别品类并替换为电商场景图 |
| 📦 **批量化产出** | 一次输入批量生成多版本海报，支持模板一键套用与翻页预览 |
| 💾 **项目持久化** | 画布状态自动保存，支持多项目管理与历史版本快照 |
| 🧠 **长短期记忆** | Soul.md（长期偏好）+ CanvasActionLog（操作审计）+ Memory Reflux（AI 提取偏好） |
| 🔍 **笔记灵感库** | 搜索并聚合真实小红书笔记，AI 提取洞察并标注灵感来源 |
| 📋 **图文模版系统** | 内置多种小红书排版风格，支持批量套用，可保存自定义模版 |
| ✏️ **AI 文案编辑** | 智能润色、扩写、缩写，所见即所得的文案精修体验 |
| 📚 **品牌知识库（RAG）** | 上传品牌手册、Brief、商品清单，AI 创作时自动调用品牌知识 |
| 📊 **RAG 质量评测** | 内置 RAGAS 评估看板，实时监控知识库检索质量 |
| 📡 **SSE 实时进度** | 生成过程逐步可见，每个 Agent 执行状态即时推送 |
| 🖨️ **高清图片导出** | html-to-image 前端 DOM 导出 + Playwright 服务端截图，输出海报级高分辨率 PNG |

---

## 🏗 技术架构

```
前端层 (Pure HTML + React 18 + ReactFlow + Tailwind CSS)
         │  REST API + SSE 实时推送
         ▼
API 服务层 (FastAPI + Uvicorn)
  ├── /api/v1/tasks      → Designer 工作流任务分发
  ├── /api/v1/dialogue   → Router Agent 对话 SSE 流
  ├── /api/v1/projects   → 项目持久化与快照管理
  ├── /api/v1/action-logs→ 画布操作审计日志
  ├── /api/v1/memory     → 用户偏好记忆提取
  ├── /api/v1/templates  → 图文模版 CRUD
  ├── /api/v1/history    → 生成历史审计
  ├── /api/v1/export     → 高清图片导出
  ├── /api/v1/rag        → 品牌知识库管理
  └── /api/v1/mcp        → MCP 工具调用
         │
         ▼
智能体层 (LangGraph)
  ├── Designer 工作流: Slicer → [Refiner/LayoutAnalyzer/StyleAnalyzer]
  │                    → StyleEvolve → Painter → StyleCritic → Composer → Reviewer
  └── Router 对话图: Router → DesignerAgent / CreativeAgent / KnowledgeAgent
         │
         ▼
核心服务层
  ├── LLM (OpenAI 兼容接口)        外部 AI 服务
  ├── RAG (LlamaIndex + ChromaDB)  ├── Nano-Banana 2
  ├── 图片导出 (Playwright)         ├── DALL-E 3
  └── 持久化 (SQLite + 本地文件)   └── Qwen 视觉模型
```

**技术选型**：

| 层级 | 技术栈 |
|------|--------|
| 前端 | React 18, ReactFlow, Tailwind CSS, Lucide Icons（均 CDN），Babel（JSX 编译） |
| 后端 | FastAPI, Uvicorn, Python 3.10+ |
| AI 引擎 | LangGraph, LangChain, OpenAI 兼容接口 |
| RAG | LlamaIndex, ChromaDB, rank-bm25（混合检索） |
| 数据库 | SQLite + aiosqlite（开发） / PostgreSQL（生产推荐） |
| 图片处理 | html-to-image（前端 DOM 导出）, Playwright（服务端截图）, Pillow（压缩） |

---

## 🚀 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+（可选，仅用于修改前端 JSX 源码后重新编译）
- 可访问 OpenAI 兼容 API（或即梦 AI SessionID）

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/magnes.git
cd magnes
```

### 2. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 .env，至少填入 OPENAI_API_KEY
```

### 3. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt

# 安装 Playwright 浏览器（导出功能需要）
playwright install chromium
```

### 4. 启动后端

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8088
```

### 5. 打开前端

```bash
# 方式一：直接在浏览器打开（最简单）
open frontend/index.html

# 方式二：Python HTTP Server 托管（推荐，避免跨域问题）
python -m http.server 3000 --directory frontend
# 然后访问 http://localhost:3000
```

### 6. 验证运行

- 后端 API 文档：http://localhost:8088/docs
- 前端画布：http://localhost:3000

---

## ⚙️ 环境变量配置

```env
# LLM 配置（必填）
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # 可替换为 DeepSeek、Qwen 等兼容接口
OPENAI_MODEL=gpt-4o


# 视觉分析（可选，用于图层切片和风格反推）
QWEN_API_KEY=your_qwen_key

# 存储路径（可选，有默认值）
DATABASE_URL=sqlite+aiosqlite:///./magnes.db
CHROMA_DB_PATH=./chroma_db
STORAGE_PATH=./storage
EXPORT_PATH=./exports

# 生产环境必填
API_TOKEN=your_secret_token
CORS_ORIGINS=https://your-domain.com
```

---

## 📁 项目结构

```
magnes/
├── backend/                    # Python FastAPI 后端
│   ├── .env.example            # 环境变量模版
│   ├── main.py                 # FastAPI 应用入口
│   └── app/
│       ├── agents/             # LangGraph 智能体
│       │   ├── planner/        # Router Agent（意图解析、路由分发）
│       │   │   ├── router.py
│       │   │   ├── graph.py
│       │   │   └── state.py
│       │   ├── designer_agent.py   # 视觉生成 Agent
│       │   ├── creative_agent.py   # 文案与灵感 Agent
│       │   ├── knowledge_agent.py  # 品牌知识库 Agent
│       │   └── experts/        # 领域执行层（Expert）
│       │       ├── refiner.py
│       │       ├── layout_analyzer.py
│       │       ├── style_analyzer.py
│       │       ├── style_evolve.py
│       │       ├── style_critic.py
│       │       ├── painter.py
│       │       ├── copy_writer.py
│       │       ├── inspiration_analyst.py
│       │       └── visual_critic.py
│       ├── api/                # FastAPI 路由
│       ├── core/               # 核心服务（LLM、DB、Playwright、MCP）
│       ├── models/             # SQLAlchemy 数据模型（Project、Snapshot 等）
│       ├── rag/                # RAG 模块（LlamaIndex + ChromaDB + BM25）
│       ├── schema/             # MagnesState / PlannerState TypedDict
│       ├── skills/             # 可扩展业务技能包
│       └── tools/              # 工具节点（Slicer、Composer、Reviewer 等）
│
├── frontend/                   # 纯静态前端
│   ├── index.html              # 主入口
│   ├── src/                    # JSX 源码
│   │   ├── app.js              # 主画布组件
│   │   ├── context/            # React Context 全局状态
│   │   ├── hooks/              # 自定义 React Hooks
│   │   ├── nodes/              # ReactFlow 节点组件
│   │   ├── components/ui/      # 对话面板、遮罩编辑器等 UI 组件
│   │   ├── services/           # API 调用服务
│   │   └── utils/              # 工具函数、常量、节点工厂、API Client
│   └── js/compiled/            # Babel 编译产物（自动生成）
│
├── scripts/
│   └── generate-build-info.js  # 构建脚本（版本注入、缓存清理）
├── specs/                      # 企业级文档（需求、设计、部署）
├── package.json                # Babel 构建配置
└── README.md
```

---

## 🤖 多智能体工作流

Magnes 内置两套独立的 LangGraph 智能体图：

### Designer 工作流（内容生产）

```
用户触发
    │
    ▼
init_node                        ← 初始化 MagnesState，注入输入参数
    │
    ▼
slicer_node                      ← 调用 Qwen 视觉模型，分析输入图片图层
    │
    ├──→ refiner_node            ← 风格反推（参考图 → style_prompt）
    ├──→ layout_analyzer_node    ← 排版分析（计算归一化坐标）
    └──→ style_analyzer_node     ← 美学基因提取（双语提示词）
            │
            ▼
    style_evolve_node            ← 提示词迭代演化（V0 → Vn，用户驱动 ReAct）
            │
            ▼
    painter_node                 ← 调用 Nano-Banana 2 / DALL-E 3 生成背景
            │
            ▼
    process_evolution_update     ← 关联生成图与版本历史
            │
            ▼
    style_critic_node            ← 视觉审计评分（clone / evolution 模式）
            │
            ▼
    composer_node                ← 合并图层 + 文案 + 模版，生成排版 HTML
            │
            ▼
    reviewer_node                ← 美学审核
            │
            ▼
         输出结果（实时通过 SSE 推送每个步骤）
```

### Router 对话图（意图驱动）

```
用户对话输入
    │
    ▼
router_agent               ← LLM 解析用户意图，注入 Soul.md 记忆，输出 action
    ├──→ designer_agent    → 处理视觉生成请求（生图、提示词优化、风格保持）
    │       ├── style_evolve  → 提示词演化
    │       └── painter       → 调用生图 API
    ├──→ creative_agent    → 处理内容创作请求（文案、灵感分析、搜索）
    │       ├── copy_writer       → 生成小红书文案
    │       └── inspiration_analyst → RAG 检索灵感库
    ├──→ knowledge_agent   → 从品牌知识库中检索回答（RAG 混合检索）
    └──→ chat              → 直接对话回复（Summary）
```

---

## 📚 RAG 知识库系统

品牌知识库采用 **五阶段检索增强流程**：

```
Stage 01  文档列表    ← 上传 DOCX/PDF/文本，按分类归档
Stage 02  文档分块    ← 父子分块策略（Parent Chunk + Sub Chunk）+ 图片识别分块
Stage 03  检索增强    ← 文档核心摘要 + 语义标签 + 查询改写（Query Rewriting）
Stage 04  召回分块    ← BM25 关键词检索 + 向量语义检索，RRF 融合排序
Stage 05  RAGAS 评测  ← 忠实度、相关性、检索精度、检索召回率四维度评估
```

---

## 🛠 开发指南

### 修改前端 JSX 源码后重新编译

```bash
# 单次编译
npm run build

# 监听模式（推荐开发时使用）
npm run build:watch
```

### 自定义一级 Agent

1. 在 `backend/app/agents/` 下创建 `{name}_agent.py`，实现 `call_{name}_model(state)` 入口函数
2. 在 `backend/app/agents/planner/router.py` 的 `VALID_ACTIONS` 中注册 action
3. 在 `backend/app/agents/planner/graph.py` 中注册节点和边

### 自定义 Expert

**节点型 Expert**（加入 Designer Workflow）：
1. 在 `backend/app/agents/experts/` 下创建 `{name}.py`，实现 `{name}_node(state)` 函数
2. 在 `backend/app/core/workflow.py` 中注册节点和编排边

**函数型 Expert**（被 Agent 内联调用）：
1. 在 `backend/app/agents/experts/` 下创建 `{name}.py`，实现纯函数接口
2. 在调用方 Agent 中通过 `await` 直接调用

### 自定义前端节点类型

1. 在 `frontend/src/nodes/rf/` 下创建节点组件
2. 在 `frontend/src/app.js` 的 `nodeTypes` 映射表中注册
3. 在 `frontend/src/utils/node-helpers.js` 中添加工厂函数

### 切换 LLM Provider

修改 `backend/.env` 中的 `OPENAI_BASE_URL` 和 `OPENAI_MODEL` 即可，无需修改代码：

```env
# 使用 DeepSeek
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat

# 使用本地 Ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=qwen2.5:14b
```

### Docker 部署

```bash
# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f backend
```

> 详细部署文档见 [specs/06_deployment_and_operations.md](specs/06_deployment_and_operations.md)

---

## 🧭 User Journey

> 下面是 Magnes 的完整使用流程。即使你从未听说过这个项目，沿着这 9 个模块看一遍，也能快速理解它是如何帮助小红书创作者从「灵感输入」走到「成图输出」的。

---

### 1. 对话助手输入

Magnes 的右侧常驻一个 AI 助手面板。你可以用自然语言描述需求，AI 会自动理解意图，并在画布上创建对应的工作流节点。

![对话驱动生成1](./assets/screenshots/01a-dialogue-template-generation-1.png)

![对话驱动生成2](./assets/screenshots/01b-dialogue-template-generation-2.png)

---

### 2. 小红书灵感搜索

在「笔记灵感库」中搜索真实的小红书笔记，AI 会以瀑布流展示相关内容，并将多篇笔记的核心信息汇总成活动合集概要。

![笔记灵感库](./assets/screenshots/02a-search-xiaohongshu-notes.png)

点击「灵感来源」，还能精确看到 AI 引用了哪些笔记、哪一段文字或哪一张图片，确保内容可追溯。

![灵感来源溯源](./assets/screenshots/02b-inspiration-source-trace.png)

---

### 3. 图文模板生成

将内容输入节点与图文模板节点连接，即可一键生成多版本海报。左侧组件库支持拖拽节点，右侧实时预览输出效果。

![工作流画布](./assets/screenshots/03a-template-generation-workflow.png)

在粉色、绿色、蓝色等多种活动模板中一键切换，支持翻页查看多版本海报。

![模板选择与生成](./assets/screenshots/03b-select-template-generate-image.png)

---

### 4. 文案编辑

打开「内容详情」弹窗，查看 AI 提取的结构化活动信息。底部内联调用 AI 对文案进行「润色 / 缩写 / 扩写」，修改结果可直接同步回画布节点。

![文案编辑](./assets/screenshots/04-copy-edit-detail.png)

---

### 5. AI 生图与提示词优化

Magnes 内置 AI 生图库和提示词库，支持风格反推和提示词自迭代优化。上传参考图，AI 会自动提取风格 Prompt 并不断迭代优化，直到输出满意的结果。

![AI 生图库](./assets/screenshots/05a-ai-image-generation-library.png)

![AI 提示词库](./assets/screenshots/05b-ai-prompt-library.png)

![提示词优化](./assets/screenshots/05c-prompt-optimization.jpeg)

---

### 6. 电商生图 Skill

上传商品原图（如白底香水瓶），AI 自动识别商品类别和外观特征，推荐「电商生图 Skill」。Skill 自动构建完整 Prompt，调用 Nano-Banana 2 生成奢华风格场景图，右侧版本列表支持 V1/V2 对比。

![电商生图](./assets/screenshots/06-ecommerce-image-skill.png)

---

### 7. 精细编排

在「精细编排」节点中，你可以对画布上的每个元素进行像素级调整：图层位置、文字样式、配色方案等，实现海报的最终精修。

![精细编排](./assets/screenshots/07-fine-tune-node.png)

---

### 8. RAG 品牌知识库

上传品牌手册、Brief、商品清单等文档，AI 会自动分类、分块并入库。知识库采用父子分块策略，对文档内嵌图片也会调用视觉模型生成描述，确保视觉素材不丢失。

![知识库文档管理](./assets/screenshots/08a-rag-doc-upload-category.png)

![父子分块](./assets/screenshots/08b-rag-parent-child-chunk.png)

![图片分块](./assets/screenshots/08c-rag-image-chunk.png)

检索增强阶段自动为文档生成核心摘要和语义标签，并对用户查询进行多维度改写，大幅提升召回覆盖率。

![检索增强](./assets/screenshots/08d-rag-retrieval-enhancement.png)

召回结果展示每个片段的相关性评分和来源位置，方便直接审查检索质量。

![语义召回](./assets/screenshots/08e-rag-semantic-recall.png)

内置 RAGAS 评估框架，从忠实度、相关性、检索精度、检索召回四个维度量化知识库质量。

![RAGAS 评测](./assets/screenshots/08f-rag-evaluation-ragas.png)

---

### 9. OpenClaw 最终输出

最终，Magnes 通过 OpenClaw 节点输出可直接发布的小红书海报。支持高清 PNG 导出，所有图层、文案、视觉元素已完整合成。

![OpenClaw 输出](./assets/screenshots/09a-openclaw.png)

![OpenClaw Skill 生成结果](./assets/screenshots/09b-openclaw-skill-output.png)

---

以上就是 Magnes 的完整用户旅程：**对话输入 → 灵感搜索 → 模板生成 → 文案编辑 → AI 生图 → 电商 Skill → 精细编排 → 品牌知识库 → 最终成图输出**。


## 📄 企业级文档

完整的技术文档位于 [`specs/`](./specs/) 目录：

| 文档 | 内容 |
|------|------|
| [需求调研报告](./specs/01_discovery_research.md) | 项目背景、竞品分析、用户画像 |
| [需求规格说明书](./specs/02_requirements_spec.md) | FR/NFR 需求清单、需求追踪矩阵 |
| [系统设计文档](./specs/03_system_design.md) | 架构图、模块视图、序列图、扩展点 |
| [数据设计文档](./specs/04_data_design.md) | 数据实体、ER 图、数据流、存储策略 |
| [关键业务流程](./specs/05_business_processes.md) | 端到端流程、状态机、SLA 指标 |
| [部署与运维指南](./specs/06_deployment_and_operations.md) | Docker 部署、CI/CD、监控、灾备 |
| [前端 API 调用说明](./specs/07_frontend_api_calls.md) | 接口列表、请求/响应格式、SSE 处理 |

---

## 📜 License

[MIT](LICENSE) © 2026 Magnes 
