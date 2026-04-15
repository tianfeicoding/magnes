# Magnes Studio - 企业级文档中心

**AI 驱动的小红书内容生产工作台**

*从灵感到成图，一个画布完成全部流程*

---

## 📋 文档概述

本目录包含 **Magnes Studio** 的完整企业级文档，涵盖需求分析、系统设计、数据模型、业务流程、部署运维等各个方面。这些文档遵循企业软件工程优秀实践，适用于需求评审、技术设计、开发实施、测试验收、生产部署等全生命周期。

## 🎯 系统特性

### 核心能力
- 🤖 **多智能体协作**：Planner + Designer 双图架构，6 个专业 Agent 分工协作
- 🎨 **可视化工作流画布**：基于 ReactFlow 的拖拽式节点编排，实时预览每个 AI 步骤的输出
- ✏️ **精细编排节点**：WYSIWYG 图层编辑器，支持撤销/重做、字体切换、批量导出
- 🖼️ **AI 生图集成**：支持 Nano-Banana 2（即梦）/ DALL-E 3 双引擎，一键替换背景与场景
- 📚 **品牌知识库（RAG）**：LlamaIndex + ChromaDB + BM25 混合检索，积累品牌风格记忆
- 🔍 **笔记灵感库**：搜索并聚合真实小红书笔记，AI 提取洞察并标注灵感来源
- 📋 **图文模版系统**：内置多种小红书排版风格，支持批量套用，可保存自定义模版
- 🔐 **用户认证体系**：基于 FastAPI-Users 的 JWT Token 鉴权，支持多用户协作
- 📡 **SSE 实时进度**：生成过程逐步可见，每个 Agent 执行状态即时推送
- 🖨️ **高清图片导出**：Playwright 服务端截图，输出海报级高分辨率 PNG
- 🐳 **Docker 容器化部署**：单容器架构，一键部署，支持 CI/CD 集成

### 技术架构
- **前端**：React 18 + ReactFlow + Tailwind CSS（CDN 加载，纯静态）
- **后端**：FastAPI + Uvicorn + Python 3.11
- **AI 引擎**：LangGraph + LangChain + OpenAI 兼容接口
- **认证**：FastAPI-Users + JWT Token
- **RAG**：LlamaIndex + ChromaDB + rank-bm25（混合检索）
- **数据库**：SQLite + aiosqlite（开发）/ PostgreSQL（生产推荐）
- **部署**：Docker + Docker Compose

---

## 📚 文档导航

### 🔍 第一步：了解项目（必读）

#### [01. 需求调研报告](./01_discovery_research.md)
**目标读者**：产品经理、业务负责人、项目管理者  
**内容**：
- 项目背景与业务驱动
- 现状痛点与核心诉求
- 竞品分析（Canva AI、创客贴 AI、即梦 AI）
- 业务目标与成功指标
- 用户画像与使用场景
- **新增功能特性**：用户认证、精细编排、字体系统、AI 绘图独立接口、Docker 部署

**关键要点**：
- 为什么要做这个系统？
- 解决什么业务痛点？
- 与竞品的差异化在哪里？
- 新增了哪些核心能力？

---

### 📋 第二步：需求与设计（核心文档）

#### [02. 需求规格说明书](./02_requirements_spec.md) ⭐ UPDATED
**目标读者**：产品经理、开发工程师、测试工程师  
**内容**：
- 功能需求清单（FR-01 ~ FR-24）
  - FR-22：用户认证与授权系统（新增）
  - FR-23：精细编排节点（新增）
  - FR-24：AI 绘图独立接口（新增）
- 非功能需求（性能、可用性、安全性）
- 集成需求（外部 API、环境变量）
- 需求追踪矩阵

**关键要点**：
- 系统需要实现哪些功能？
- 性能、安全等指标是什么？
- 如何验证需求是否满足？

#### [03. 系统设计文档](./03_system_design.md) ⭐ UPDATED
**目标读者**：架构师、开发工程师  
**内容**：
- 总体架构图（前端、后端、智能体、认证、工具、存储）
- **新增**：认证与安全架构（第 3 章）
- **新增**：精细编排节点设计（第 4.1 节）
- 模块视图与职责划分
- 序列图（表单模式 + 自然语言模式）
- 错误与回退策略
- 扩展点与技术演进

**关键要点**：
- 系统的整体架构是什么？
- 用户认证如何工作？
- 精细编排节点的撤销/重做如何实现？
- 各模块如何协作？

#### [04. 数据设计文档](./04_data_design.md) ⭐ UPDATED
**目标读者**：数据架构师、开发工程师  
**内容**：
- 核心数据实体（Template、GenerationHistory、MagnesState）
- **新增**：User（用户）实体
- **新增**：Config（系统配置）实体
- **新增**：FineTuneState（精细编排状态）实体
- 关系模型与 ER 图
- 数据流设计（表单模式 + 自然语言模式）
- 存储策略与扩展建议

**关键要点**：
- 系统涉及哪些数据实体？
- 用户数据如何存储和关联？
- 数据如何流转？
- 如何持久化与查询？

---

### 🔄 第三步：业务流程与集成

#### [05. 关键业务流程文档](./05_business_processes.md) ⭐ UPDATED
**目标读者**：业务分析师、运营人员、开发工程师  
**内容**：
- **新增**：用户认证流程（第 1 章）
  - 登录流程、注册流程、API 鉴权流程
- **新增**：精细编排节点流程（第 2 章）
  - 撤销/重做流程、图层编辑流程、分页与批量导出流程
- 端到端业务流程（表单模式 + 自然语言模式）
- LangGraph 节点执行流程
- 任务状态生命周期
- 外部数据服务调用
- 运维与异常处理
- SLA 与告警建议

**关键要点**：
- 用户如何登录和使用系统？
- 精细编排的撤销/重做如何工作？
- 系统内部如何运作？
- 如何监控和运维？

#### [07. 前端 API 调用说明](./07_frontend_api_calls.md) ⭐ UPDATED
**目标读者**：前端开发、测试工程师、运维人员  
**内容**：
- 接口列表与调用关系
  - `POST /api/v1/auth/jwt/login`：用户登录（新增）
  - `POST /api/v1/auth/register`：用户注册（新增）
  - `POST /api/v1/painter/generate/background`：AI 生图（新增）
  - `GET/PUT /api/v1/config`：系统配置（新增）
- 调用流程与序列图
- 接口详细说明（请求/响应格式、超时策略、错误处理）
- 监控与日志建议

**关键要点**：
- 前端如何调用后端接口？
- 认证流程如何实现？
- 接口的输入输出格式是什么？
- 如何处理异常情况？

---

### 🚀 第四步：部署与运维

#### [06. 部署与运维指南](./06_deployment_and_operations.md) ⭐ UPDATED
**目标读者**：DevOps 工程师、运维人员  
**内容**：
- **新增**：Docker 容器化部署（第 6 章）
  - Dockerfile 详解
  - Docker Compose 配置
  - 容器部署步骤
  - 健康检查与生产建议
- 本地开发部署
- 环境变量配置
- 安全与合规
- 配置与 Secrets 管理

**关键要点**：
- 如何部署系统？
- Docker 部署的具体步骤？
- 如何监控系统运行状态？
- 遇到问题如何排查？

---

## 🆕 版本更新历史

### v2.0.0 - 功能增强版本（2025-04-15）

#### 重大更新
- 🔐 **用户认证与授权系统**
  - 基于 FastAPI-Users 的 JWT Token 鉴权
  - 支持用户注册、登录、Token 刷新
  - 所有 API 接口受保护，保障数据安全
  
- ✨ **精细编排节点增强*
  - WYSIWYG 可视化图层编辑器
  - 撤销/重做功能（最多 50 步历史）
  - 图层拖拽、缩放、吸附对齐
  - 字体选择系统（5 种中文字体）
  - 批量导出所有页面
  
- 🎨 **AI 绘图独立接口*
  - 支持文生图和图生图
  - 参考图模式保持风格一致性
  - Nano-Banana 2 / DALL-E 3 双引擎
  
- 🐳 **Docker 容器化部署*
  - 单容器架构，一键部署
  - Docker Compose 配置
  - 支持数据卷持久化
  
- ⚙️ **系统配置管理*
  - 动态配置调整，无需重启
  - 支持功能开关（RAG/MCP）

#### 文档更新
- 全面更新所有企业级文档
- 新增认证、精细编排、Docker 部署等章节
- 补充需求追踪矩阵
- 完善业务流程图和架构图

---

## 📊 文档使用指南

### 按角色推荐阅读

#### 产品经理 / 业务负责人
1. 📄 [01. 需求调研报告](./01_discovery_research.md) - 了解项目背景与新增功能
2. 📄 [02. 需求规格说明书](./02_requirements_spec.md) - 掌握功能需求
3. 📄 [05. 关键业务流程](./05_business_processes.md) - 理解业务流程

#### 系统架构师
1. 📄 [01. 需求调研报告](./01_discovery_research.md) - 了解业务背景
2. 📄 [03. 系统设计文档](./03_system_design.md) - 架构设计（重点看认证和精细编排）
3. 📄 [04. 数据设计文档](./04_data_design.md) - 数据模型
4. 📄 [06. 部署与运维指南](./06_deployment_and_operations.md) - Docker 部署策略

#### 开发工程师
1. 📄 [02. 需求规格说明书](./02_requirements_spec.md) - 功能需求（重点看 FR-22/23/24）
2. 📄 [03. 系统设计文档](./03_system_design.md) - 技术设计（重点看第 3 章认证、第 4.1 节精细编排）
3. 📄 [04. 数据设计文档](./04_data_design.md) - 数据模型（重点看 User/Config/FineTuneState）
4. 📄 [07. 前端 API 调用说明](./07_frontend_api_calls.md) - 接口规范（重点看 3.14-3.19）

#### 测试工程师
1. 📄 [02. 需求规格说明书](./02_requirements_spec.md) - 测试用例来源（重点看 FR-22/23/24）
2. 📄 [05. 关键业务流程](./05_business_processes.md) - 测试场景（重点看第 1-2 章）
3. 📄 [07. 前端 API 调用说明](./07_frontend_api_calls.md) - 接口测试（重点看认证接口）

#### DevOps / 运维工程师
1. 📄 [06. 部署与运维指南](./06_deployment_and_operations.md) - Docker 部署（重点看第 6 章）
2. 📄 [03. 系统设计文档](./03_system_design.md) - 架构理解
3. 📄 [05. 关键业务流程](./05_business_processes.md) - 监控指标

---

## 🎓 快速开始

### 新人入职推荐路径

#### 第 1 天：了解项目
- 阅读 [01. 需求调研报告](./01_discovery_research.md) - 快速了解业务背景
- 阅读项目根目录的 [README.md](../README.md) - 运行 Demo

#### 第 2-3 天：掌握需求与设计
- 详细阅读 [02. 需求规格说明书](./02_requirements_spec.md)
- 详细阅读 [03. 系统设计文档](./03_system_design.md)
- 结合代码理解架构

#### 第 4-5 天：深入技术细节
- 阅读 [04. 数据设计文档](./04_data_design.md)
- 阅读 [05. 关键业务流程](./05_business_processes.md)
- 阅读 [07. 前端 API 调用说明](./07_frontend_api_calls.md)

#### 第 1 周末：实践部署
- 阅读 [06. 部署与运维指南](./06_deployment_and_operations.md)
- 自己部署一遍系统（本地和 Docker）
- 尝试修改和扩展

---

## 🔧 文档维护规范

### 更新原则
1. **及时性**：代码功能变更后，24 小时内更新相关文档
2. **一致性**：确保文档与代码实现保持一致
3. **完整性**：每次更新需同步相关的所有文档
4. **可追溯**：在更新摘要中记录重要变更

### 更新流程
1. 代码功能开发完成
2. 更新相关技术文档（02-07）
3. 更新本 README.md 的版本历史
4. 提交 Pull Request，注明文档变更

### 文档规范
- 使用 Markdown 格式
- 包含 Mermaid 图表（架构图、流程图、序列图）
- 代码示例使用语法高亮
- 中英文混排遵循 [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)

---

## 📞 联系方式

### 文档反馈
如果您在使用文档过程中发现任何问题，欢迎反馈：
- 📧 提交 Issue：描述问题和改进建议
- 💬 内部讨论：团队技术讨论群
- 📝 Pull Request：直接提交文档修改

### 技术支持
- 📚 开发文档：`backend/` 和 `frontend/` 目录下的代码注释
- 🎯 API 文档：启动后端后访问 `http://localhost:8088/docs`
- 🔍 问题排查：参考 [06. 部署与运维指南](./06_deployment_and_operations.md)

---

## 📝 附录

### 相关资源
- 🏠 [项目主 README](../README.md)
- 📊 [架构图集](../design/)
- 🔧 [配置示例](../backend/.env.example)
- 🐳 [Docker 配置](../docker-compose.yml)

### 技术栈文档
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [ReactFlow](https://reactflow.dev/)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [FastAPI-Users](https://fastapi-users.github.io/fastapi-users/)
- [Docker](https://docs.docker.com/)

### 外部服务文档
- [OpenAI API](https://platform.openai.com/docs)
- [Qwen 视觉模型](https://help.aliyun.com/zh/dashscope/)
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)

---

<div align="center">

**Magnes Studio**  
_AI 驱动的小红书内容生产工作台_

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](./README.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)
[![Documentation](https://img.shields.io/badge/docs-enterprise-orange.svg)](./README.md)

</div>
