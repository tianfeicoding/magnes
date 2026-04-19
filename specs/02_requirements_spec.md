# Magnes Studio - 需求规格说明书

## 1. 文档目的

在企业真实应用场景中，明确 Magnes Studio AI 内容生产工作台的功能、非功能和集成需求，为技术设计、实现与测试提供可追溯依据。

## 2. 术语

- **Node（节点）**：ReactFlow 画布上的基本工作单元，代表一个 AI 处理步骤（如生图、文案、合成）。
- **Workflow（工作流）**：由多个节点连接而成的有向图，描述内容生产的完整处理流程。
- **Agent（智能体）**：LangGraph 框架下的独立处理单元，负责特定的 AI 任务（如 Painter、CopyWriter）。
- **智能体专家（Agent Expert）**：具备独立决策能力的专业智能体，包括：意图调度专家(Planner)、灵感创意专家(Creative)、画布生成专家(Designer)、质量合规专家(Auditor)。
- **功能节点（Function Node）**：智能体下属的具体执行单元，无独立 LLM 决策能力，如 `slicer_node`、`painter_node`。
- **MagnesState**：LangGraph 状态字典，贯穿整个 Designer 工作流，携带所有中间结果。
- **RAG**：检索增强生成，通过向量检索从知识库中获取相关上下文，增强 LLM 输出质量。
- **SSE**：Server-Sent Events，服务器到客户端的单向实时推送协议，用于生成进度反馈。
- **MCP**：Model Context Protocol，用于 Agent 调用外部工具的标准协议。
- **Template（模版）**：可复用的小红书排版模版，存储于 SQLite，包含布局、字体、色彩等定义。
- **协作模式**：多智能体之间的交互模式，包括层级结构、专家团队、并行处理、批评-审查者等。

## 3. 需求概览

| 编号 | 需求类型 | 描述 |
| ---- | -------- | ---- |
| FR-01 | 功能 | 用户可在可视化画布上创建、连接、配置节点，构建内容生产工作流。 |
| FR-01-AUTH | 功能 | 支持用户认证与授权系统，基于 FastAPI-Users 实现 JWT Token 鉴权，保护 API 接口安全（基础功能）。 |
| FR-02 | 功能 | 系统通过 LangGraph 多智能体执行工作流，生成图片、文案、排版合成结果。 |
| FR-03 | 功能 | 用户可通过对话面板与 Planner 智能体交互，以自然语言描述内容需求。 |
| FR-04 | 功能 | 系统通过 SSE 实时推送生成进度，用户可见每个 Agent 的处理状态。 |
| FR-05 | 功能 | 支持多种节点类型：InputImage、Painter、Slicer、Refiner、Composer、CopyWriter、Preview。 |
| FR-06 | 功能 | Painter 节点调用 AI 生图 API（Nano-Banana 2）生成背景图片。 |
| FR-07 | 功能 | Slicer 节点调用 Qwen 视觉模型对输入图片进行图层拆解与主体提取。 |
| FR-08 | 功能 | Refiner 节点对参考图进行风格反推，提取色调、构图、视觉风格描述。 |
| FR-09 | 功能 | Composer 节点将各图层、文案、模版合并，生成小红书海报排版。 |
| FR-10 | 功能 | CopyWriter 节点生成小红书风格文案（标题、正文、话题标签）。 |
| FR-11 | 功能 | 支持模版管理（CRUD），模版存储于 SQLite，可在 Composer 节点中选择应用。 |
| FR-12 | 功能 | 支持生成历史记录查询与审计，存储每次任务的输入参数、结果和时间戳。 |
| FR-13 | 功能 | 支持 Playwright 服务端截图，将合成好的 HTML 海报导出为高分辨率图片。 |
| FR-14 | 功能 | 支持文案草稿箱功能，用户可查看、编辑、选择历史生成的文案，支持一键润色（改写、缩写、扩写）、划词 AI 优化及同步至画布节点。 |
| FR-15 | 功能 | 支持小红书搜索功能，用户可通过对话触发小红书笔记搜索、采集详情、分析灵感并生成活动总结。 |
| FR-16 | 功能 | 支持电商生图 Skill，用户上传商品图片后自动识别商品类型，生成电商主图及优化 Prompt。 |
| FR-17 | 功能 | 集成 RAG 知识库，支持文档摄入、向量检索、BM25 混合检索，用于灵感分析与风格记忆。 |
| FR-18 | 功能 | 支持 MCP 工具调用，Agent 可通过 MCP 协议调用外部工具（如搜索、数据查询）。 |
| FR-19 | 功能 | 支持安全检查节点，对生成文案进行敏感词过滤。 |
| FR-20 | 功能 | 支持风格实验室（StyleLab）节点，用户可预览和切换多种小红书风格预设。 |
| FR-21 | 功能 | 支持多智能体协作模式，采用层级结构与专家团队相结合，实现意图调度、创意生成、画布合成、质量审核的全链路自动化。 |
| FR-23 | 功能 | 精细编排节点支持撤销重做、字体切换、批量导出（FineTune），提供可视化图层编辑器，支持拖拽、缩放、撤销/重做、字体切换、批量导出。 |
| FR-24 | 功能 | AI 绘图独立接口支持文生图和图生图，可直接调用 Nano-Banana 2 / DALL-E 3 生成图片。 |
| FR-MEM-01 | 功能 | 支持用户长短期记忆系统：Soul.md（偏好设定）与 MEMORY.md（记忆索引），每次对话前自动注入 Planner 上下文。 |
| FR-MEM-02 | 功能 | 设置弹窗提供「偏好设置」Tab，支持编辑和保存 Soul.md（品牌调性、创作风格等自然语言描述）。 |
| FR-MEM-03 | 功能 | 设置弹窗提供「记忆设置」Tab，支持编辑和保存 MEMORY.md（常用工作流、历史决策、关键事实等）。 |
| FR-MEM-04 | 功能 | 后端保留结构化 UserMemory CRUD（preference/rejection/template/workflow/custom），为后续自动学习/策展做准备。 |
| NFR-01 | 非功能 | 关键 API 接口（非生成过程）响应时间 ≤ 500ms。 |
| NFR-02 | 非功能 | 单次 Designer 工作流执行超时时间默认 10 分钟，超时需返回已完成部分结果。 |
| NFR-03 | 非功能 | 系统需提供健康检查接口，返回各组件（LLM、数据库、向量库）可用性。 |
| NFR-04 | 非功能 | 前端为纯静态文件，支持本地直接打开或 Nginx 托管，无需 Node.js 运行时。 |
| NFR-05 | 非功能 | 生成历史与模版数据存储于 SQLite，支持异步读写，保证并发安全。 |
| NFR-06 | 非功能 | 所有外部 AI API 调用失败时需重试（最多 3 次），并提供降级提示。 |
| NFR-07 | 非功能 | 支持多 LLM Provider（OpenAI 兼容接口），通过环境变量切换，不修改代码。 |
| INT-01 | 集成 | 环境变量管理（`OPENAI_API_KEY`等）通过 `.env` 文件管理，不写死在代码中。 |
| INT-02 | 集成 | 前端通过 REST API + SSE 与后端通信，所有接口遵循 OpenAPI 规范。 |
| INT-03 | 集成 | 支持 MCP 协议，允许 Agent 调用外部 MCP Server 工具。 |

## 4. 详细功能需求

### 4.1 可视化工作流画布（FR-01）

- 基于 ReactFlow 渲染节点与连线，支持拖拽、缩放、平移。
- 节点类型注册机制：通过 `nodeTypes` 映射表动态注册所有节点类型。
- 连线规则：每条连线代表数据流向，连线时检查源/目标端口兼容性。
- 键盘快捷键：Delete 删除选中节点、Ctrl+Z 撤销、Ctrl+Y 重做、Ctrl+A 全选。
- 支持节点右键菜单（Node Toolbar）：复制、删除、查看详情。

### 4.2 多智能体工作流执行（FR-02）

- 调用 `POST /api/v1/tasks/run`，触发 LangGraph Designer 工作流。
- 工作流节点执行顺序：
  1. `init_node`：初始化 `MagnesState`，注入输入参数。
  2. `slicer_node`（可选）：调用 Qwen 视觉模型对输入图进行图层分析。
  3. `refiner_node`（可选）：对参考图进行风格反推。
  4. `painter_node`（可选）：调用生图 API 生成背景图片。
  5. `composer_node`：汇合所有图层，选择模版，生成排版 HTML。
  6. `reviewer_node`：美学审核（当前为占位实现，待完善）。
- 执行过程通过 SSE 实时推送状态。
- 输出：`MagnesState` 中的最终合成结果，保存至 `GenerationHistory`。

### 4.3 对话式内容规划（FR-03）

- 用户在对话面板输入自然语言描述（如"帮我生成一条秋季穿搭的小红书内容"）。
- Planner 图解析意图，路由到合适的下游 Agent：
  - `copy_writer`：文案生成
  - `inspiration_analyst`：RAG 灵感分析
  - `knowledge_agent`：知识库问答
  - `security_check`：敏感词检测
  - `summarizer`：长对话摘要
- 对话历史持久化，支持多轮上下文。
- 自动摘要：对话超过阈值时触发 `summarizer_node` 压缩历史。

### 4.4 SSE 实时进度推送（FR-04）

- 接口：`POST /api/v1/dialogue/run`，返回 `text/event-stream`。
- 事件格式：
  ```
  data: {"type": "progress", "agent": "painter", "message": "正在生成背景图片..."}
  data: {"type": "result", "data": {...}}
  data: {"type": "done"}
  ```
- 前端使用 `EventSource` 或 `fetch` + `ReadableStream` 接收事件流。
- 连接中断时前端自动重连（最多 3 次）。

### 4.5 AI 生图（FR-06）

- **主要引擎**：Nano-Banana 2，支持文本到图片、图片到图片。
- 输入：`prompt`（文本描述）、`reference_image`（可选）、`width`、`height`。
- 输出：图片 URL，系统自动下载并持久化到本地存储（`storage_utils.download_and_persist_image`）。
- 失败处理：调用失败时重试最多 3 次，仍失败则返回错误，工作流不中断（Composer 跳过生图层）。

### 4.6 图层分析（FR-07）

- 调用 Qwen 视觉模型对输入图片进行分析。
- 输出：`{"layers": [{"name": "主体", "description": "..."}, ...], "style": {...}}`。
- 支持主体提取、背景分离、元素识别。

### 4.7 风格反推（FR-08）

- Refiner 节点接受参考图，调用 Qwen 视觉模型分析。
- 输出：风格描述 Prompt（色调、构图、氛围、风格标签），注入 `MagnesState.style_prompt`。
- 该 Prompt 将作为 Painter 节点的参考输入，保证生成风格一致性。

### 4.8 排版合成（FR-09）

- Composer 节点接收：背景图层、主体图层、文案、模版 ID。
- 从 SQLite `templates` 表加载模版定义（JSON 格式：布局、字体、色彩、元素位置）。
- 生成 HTML 排版结果，传递给导出模块。
- 支持批量合成：单次工作流可生成多张不同文案变体的海报。

### 4.9 图片导出（FR-13）

- 接口：`POST /api/v1/export/image`。
- 使用 Playwright 启动无头浏览器，对排版 HTML 进行截图。
- 支持导出分辨率：标准（1080×1440）、高清（2160×2880）。
- 输出：PNG 图片文件，返回下载链接。

### 4.10 文案草稿箱与一键润色（FR-14）

- **文案草稿箱**：
  - 系统保存所有对话生成的文案到草稿箱，用户可随时查看历史文案。
  - 草稿箱支持分类展示（按对话会话、按生成时间、按内容类型）。
  - 用户可从草稿箱选择单条或多条文案进行批量操作。

- **一键润色功能**：
  - **润色（Polish）**：对选中文案进行语言优化，使其更具吸引力、情感更丰富、更符合小红书爆款风格。
  - **缩写（Shorten）**：精简文案，去掉冗余信息，保留核心要点。
  - **扩写（Expand）**：添加更多生动细节和描述，使文案更充实、更具画面感。
  - **自定义指令**：用户可输入 AI 指令引导润色方向（如"更口语化"、"更专业"、"增加 emoji"等）。

- **划词 AI 优化**：
  - 在草稿编辑器中，用户可选中文本的任意部分。
  - 选中后弹出 AI 工具栏，支持对选中内容进行润色、缩写、扩写。
  - 支持实时预览修改结果，用户可确认或取消修改。

- **接口**：
  - `POST /api/v1/rag/rewrite` - AI 润色/缩写/扩写接口
  - 请求参数：`{ text: string, action: "polish"|"shorten"|"expand", instructions?: string }`

- **前端组件**：
  - `DraftModal` - 草稿编辑弹窗，支持划词 AI 优化
  - `conversation-panel.js` - 对话面板集成草稿箱入口

### 4.11 小红书搜索与灵感分析（FR-15）

- **小红书笔记搜索**：
  - 用户可通过对话输入关键词搜索小红书笔记。
  - 调用 MCP 工具 `search_feeds`，返回笔记列表（标题、链接、作者、互动数据）。
  - 支持按排序方式筛选（综合/最新/最热）。
  - 搜索结果保留完整上下文，供后续分析使用。

- **笔记详情采集**：
  - 通过 `get_feed_detail` 获取单条笔记完整详情。
  - 包含笔记正文、图片列表、标签、发布时间、地点等元数据。
  - 自动提取 `xsec_token` 用于反爬验证。

- **灵感分析报告**：
  - `InspirationAnalyst` Agent 对搜索结果进行结构化分析。
  - 输出活动总结（名称、时间、地点、亮点、适合人群）。
  - 支持引用标注（`[[笔记N]]` 格式），标明信息来源。
  - 支持双模式输出：简洁总结模式 / 详细分析模式。

- **发布到小红书**：
  - 支持将生成的内容通过 `publish_note` 发布到小红书。
  - 需用户二次确认，防止误操作。
  - 支持图文混排，自动上传图片并关联。

- **MCP 工具层**：
  - `search_feeds(keyword)` - 搜索笔记，支持 REST API 降级
  - `get_feed_detail(feed_id, xsec_token)` - 获取笔记详情
  - `publish_note(title, content, image_urls)` - 发布笔记
  - `get_self_info()` - 获取当前用户信息

### 4.12 电商生图 Skill（FR-16）

- **Skill 系统架构**：
  - Skill 是可插拔的业务能力模块，位于 `.agent/skills/` 目录。
  - 每个 Skill 包含：`SKILL.md`（定义文档）、`references/`（配置）、`assets/`（资源）。
  - `skills_loader.py` 动态扫描并加载 Skill，将定义转化为 Prompt。

- **电商生图 Skill 流程**：
  1. **图片上传**：用户上传商品图片，系统自动识别商品类型。
  2. **分类识别**：根据视觉特征匹配预定义分类（美妆/食品/电子/等）。
  3. **风格参考**：加载分类对应的风格参考图库（`assets/reference-images/`）。
  4. **Prompt 生成**：基于角色化模板（Image 1 + Image 2 格式）生成优化 Prompt。
  5. **主图生成**：调用 Painter 节点生成电商主图。

- **Prompt 模板格式**：
  - Image 1：用户上传的商品图片
  - Image 2：分类风格参考图
  - 文本指令：包含构图、光线、风格描述的标准化模板

- **Skill 探测机制**：
  - 关键词匹配自动识别用户意图（如 "1"、"电商生图"）。
  - 动态构建增强 Prompt，注入分类配置和参考图库。
  - 支持数字选择 Fast Path（用户回复纯数字自动映射到对应模版）。

- **参考文件**：
  - `references/categories.md` - 分类配置（ID、名称、描述、参考图路径）
  - `assets/reference-images/{category}/` - 风格参考图库

### 4.13 RAG 知识库（FR-17）

- 支持文档摄入（URL、文件、文本片段）。
- 向量化存储于 ChromaDB，同时建立 BM25 倒排索引。
- 混合检索：向量相似度检索 + BM25 关键词检索，结果融合排序（RRF 算法）。
- `inspiration_analyst`：基于 RAG 检索结果进行灵感分析，输出风格建议与内容方向。
- `style_memory_agent`：记录用户历史风格偏好，供后续生成参考。

### 4.14 模版管理（FR-11）

- 接口：`GET/POST/PUT/DELETE /api/v1/templates/`。
- 模版数据模型：`Template`（id, name, layout_json, thumbnail_url, created_at, updated_at）。
- 前端支持模版预览、选择、收藏。
- 系统内置若干小红书风格预设模版（门票风、杂志风、清单风等）。

### 4.15 安全检查（FR-19）

- `security_check` 节点对文案进行敏感词过滤。
- 敏感词库：`backend/core/security/sensitive_words.txt`，支持热更新。
- 检测结果：`{"passed": true/false, "flagged_words": [...], "suggestion": "..."}`。
- 敏感内容不阻断工作流，而是标记并提示用户修改。

### 4.16 风格实验室（FR-20）

- **StyleLab 节点**：独立的风格预览和切换节点。
- 支持多种小红书风格预设（清新日系、复古胶片、极简北欧等）。
- 实时预览风格效果，支持参数微调。
- 风格配置可保存为自定义模版。

### 4.17 Planner 意图识别与 Fast Path（FR-03 扩展）

- **意图识别机制**：
  - Planner Agent 基于 LLM 输出 `action` 字段进行条件路由。
  - 支持动作类型：`copy_writer`、`inspiration_analyst`、`knowledge_agent`、`security_check`、`summarizer`、`direct_reply`。
  - 视觉激活检测：自动识别消息中是否包含图片。
  - 图片历史回溯：自动从对话历史中提取上下文图片 URL。

- **Fast Path 快速路径**：
  - **结构化数据检测**：检测到 "时间:", "地点:", "门票:" 等字段时，直接触发模版选择流程，绕过 LLM。
  - **UI Command Fast Path**：检测 `[技能指令] 确认选择模版:` 格式，直接提取模版 ID 创建节点。
  - **数字选择 Fast Path**：用户回复纯数字时，自动映射到对应模版或选项。
  - **页签上下文感知**：根据 `activeTab`（xhs/canvas）改变行为，如 xhs 页签禁止触发电商技能。

- **幻觉修正机制**：
  - 当 LLM 输出 `chat` action 但内容包含"分析/总结"关键词时，自动修正为 `analyze_inspiration`。
  - 技能指令注入：检测到 `[技能指令]` 或 `[电商生图Skill]` 标记时触发特殊处理。

### 4.18 画布操作动作（FR-01 扩展）

Planner Agent 支持通过对话触发以下画布操作：

| 动作 | 功能 | 参数 |
|------|------|------|
| `create_node` | 在画布创建节点 | `node_type`, `position`, `data` |
| `update_node` | 更新节点数据 | `node_id`, `data` |
| `delete_node` | 删除节点 | `node_id` |
| `select_template` | 选择排版模版 | `template_id` |
| `run_workflow` | 执行工作流 | `node_ids` |
| `mirror_image` | 镜像图片 | `image_url`, `direction` |
| `export_canvas_image` | 导出画布为图片 | `format`, `quality` |
| `run_xhs_publish` | 发布到小红书 | `content`, `images` |

- 所有画布操作通过 SSE 推送执行结果，前端实时更新画布状态。

### 4.19 多智能体协作模式（FR-21）

系统应采用**层级结构**与**专家团队**相结合的多智能体协作模式，通过意图调度专家(Planner)作为指挥中心，协调三大专业领域智能体。

#### 4.19.1 智能体专家定义

| 智能体专家 | 角色定位 | 职责范围 | 下属功能节点 |
|------------|----------|----------|--------------|
| **意图调度专家 (Planner Agent)** | 意图识别与任务分发中心 | 理解用户意图，指派任务给合适的专家 | `planner_agent`, `summarizer` |
| **灵感创意专家 (Creative Agent)** | 内容创作与 RAG 知识检索 | 挖掘趋势、撰写文案、知识问答 | `inspiration_analyst`, `copy_writer`, `knowledge_agent`, `ingest_urls`, `xhs_search` |
| **画布生成专家 (Designer Agent)** | 视觉分析与画布协议合成 | 图层切割、视觉设计、画布合成 | `slicer_node`, `refiner_node`, `painter_node`, `composer_node` |
| **质量合规专家 (Auditor Agent)** | 安全审计与美学质量评价 | 敏感词过滤、美学评分、完整性检查 | `security_check`, `reviewer_node` |

#### 4.19.2 协作模式要求

**层级结构模式 (Hierarchical Structures)**：
- 意图调度专家接收用户输入，通过条件边(Conditional Edges)动态决定激活哪些后续专家节点
- 典型控制流：`调度专家` → `(创意专家 + 生成专家)` → `合规专家`
- 每个专家拥有独立的 Prompt 模板和工具集

**专家团队模式 (Expert Teams)**：
- 各智能体各司其职，专注特定领域
- 创意专家专注文字灵魂，生成专家专注视觉构建
- 每个专家节点可独立扩展，不影响其他专家

**并行处理模式 (Parallel Processing)**：
- 画布生成专家内部，物理切片(`slicer_node`)与逻辑建模(`refiner_node`)允许异步/并行执行
- 并行执行结果在 `composer_node` 汇合

**批评-审查者模式 (Critic-Reviewer)**：
- 质量合规专家在工作流末端闭环
- 对产出进行美学质量与安全政策的双重审计
- 不达标的产出将被拦截或打回修正

#### 4.19.3 功能节点分类

**Agent（智能体）- 具备 LLM 决策能力**：
- `planner_agent`: 核心决策节点，负责 LLM 意图解析
- `inspiration_analyst`: 语义检索与灵感提炼
- `copy_writer`: 文案生成
- `knowledge_agent`: 知识库问答

**Node（功能节点）- 工具执行，无 LLM 决策**：
- `slicer_node`: 图像切割（调用 Qwen 视觉 API）
- `refiner_node`: 布局建模（调用 Qwen 视觉 API）
- `painter_node`: 背景生成（调用 Nano-Banana API）
- `composer_node`: 画布合成（规则引擎）
- `security_check`: 敏感词过滤（规则引擎）
- `reviewer_node`: 美学评分（占位实现）
- `summarizer`: 对话压缩（LLM 调用）

### 4.20 用户认证与授权（FR-01-AUTH）

**认证架构**：
- 基于 FastAPI-Users 实现完整的用户认证系统
- 支持 JWT Token 鉴权，Token 有效期可配置
- 用户密码使用 bcrypt 加密存储

**接口鉴权**：
- 公开接口：`/api/v1/auth/*`（登录、注册、刷新 Token）
- 受保护接口：所有 `/api/v1/*` 路由（除 RAG 公共接口外）
- 鉴权方式：HTTP Bearer Token (`Authorization: Bearer <token>`)

**用户管理**：
- 用户注册：`POST /api/v1/auth/register`
- 用户登录：`POST /api/v1/auth/jwt/login`
- Token 刷新：`POST /api/v1/auth/jwt/refresh`
- 用户信息：`GET /api/v1/auth/me`

### 4.21 精细编排节点（FR-23）

**节点功能**：
- **可视化图层编辑器**：WYSIWYG 画布，实时预览图层位置和内容
- **图层操作**：
  - 拖拽移动图层位置
  - 缩放手柄调整图层大小
  - 吸附对齐（辅助线提示）
  - 图层复制/删除
- **撤销/重做**：
  - 支持最多 50 步历史记录
  - 快捷键：Ctrl+Z（撤销）、Ctrl+Y（重做）
  - 历史栈自动去重
- **字体设置**：
  - 支持下拉框选择字体
  - 内置字体：系统默认、得意黑、阿里普惠体、江西拙楷、欣意冠黑体
  - 字体文件通过 @font-face 加载
- **样式编辑**：
  - 字号调整（+/- 按钮）
  - 加粗/斜体/下划线切换
  - 文字颜色选择（预设 + 自定义）
  - 对齐方式（左/中/右）
- **批量导出**：
  - 支持导出当前页为 PNG
  - 支持批量导出所有页面
  - 使用 `html-to-image` 前端导出（已替换 html2canvas，解决文字偏移问题）
  - 导出分辨率：标准 1080×1440，高清 2160×2880
- **背景替换**：
  - 本地上传：支持从本地选择图片作为背景
  - AI 生成背景：输入提示词调用 `/painter/generate/background` 生成背景
  - 素材库选取：通过侧边栏素材库选择已有图片替换背景
  - 参考模式：支持 `txt2img` 和 `img2img`（基于当前背景图生成）
- **侧边栏素材集成**：
  - 点击背景替换按钮打开右侧素材库侧边栏
  - 支持从素材库拖拽/点击选择图片应用到背景层
  - 选中后自动切回画布 Tab
- **分页支持**：
  - 支持多页内容切换（`currentPage`）
  - 每页独立覆写样式（`pageOverrides`）
  - 图片层和文字层的分页数据路由（`pageOffset * itemsPerPage`）

**数据流**：
1. 上游节点输入布局数据（layers）
2. 精细编排节点解析并渲染到画布
3. 用户编辑（拖拽、缩放、样式修改、背景替换）后标记 `isDirty: true`
4. 编辑后的布局数据传递给下游节点
5. 导出时克隆画布 DOM，使用 `html-to-image` 生成 PNG

### 4.22 AI 绘图独立接口（FR-24）

**接口设计**：
- `POST /api/v1/painter/generate/background` - 生成背景图片
- `POST /api/v1/painter/generate/image2image` - 图生图

**请求参数**：
- `prompt`: 图片描述词
- `aspect_ratio`: 宽高比（如 "3:4"）
- `reference_image`: 参考图片 URL（可选，用于 img2img）
- `reference_mode`: 参考模式（"txt2img" 或 "img2img"）

**响应格式**：
```json
{
  "url": "http://localhost:8088/uploads/xxx.png",
  "width": 1024,
  "height": 1536
}
```

**支持的生图引擎**：
- Nano-Banana 2（即梦）- 推荐，国内可用
- DALL-E 3（OpenAI）

### 4.23 用户记忆系统（FR-MEM-01 ~ FR-MEM-04）

#### 4.23.1 记忆分层架构

采用**手动录入 + 自动注入**机制，分为三层：

| 层级 | 对应实现 | 内容形式 | 注入优先级 | 前端入口 |
|------|----------|----------|------------|----------|
| **长期偏好** | Soul.md (`memory_type="soul"`) | 自然语言人设卡 | 最高 | 设置 → 偏好设置 |
| **中期记忆** | MEMORY.md (`memory_type="memory"`) | Markdown 事实清单 | 次高 | 设置 → 记忆设置 |
| **结构化记忆** | UserMemory 表 (preference/rejection/...) | JSON 键值对 | 按需 | 后端保留，按需开放 |

#### 4.23.2 Soul.md — 偏好设定（FR-MEM-01 / FR-MEM-02）

- 用户在「偏好设置」Tab 中编辑一段自然语言自我描述。
- 内容示例：品牌调性、创作风格、固定要求、明确不喜欢的元素。
- 以 `memory_type="soul"`、`key="soul_md"` 存储于 `user_memories` 表，`confidence=1.0`。
- 每次对话前由后端自动读取，以 `[用户设定 - Soul.md]` 标题注入 system prompt。

#### 4.23.3 MEMORY.md — 记忆索引（FR-MEM-01 / FR-MEM-03）

- 用户在「记忆设置」Tab 中编辑一段 Markdown 事实清单。
- 内容示例：常用模板、已验证配色、成功工作流、上次活动信息。
- 以 `memory_type="memory"`、`key="memory_md"` 存储于 `user_memories` 表，`confidence=1.0`。
- 每次对话前由后端自动读取，以 `[记忆索引 - MEMORY.md]` 标题注入 system prompt。

#### 4.23.4 自动注入流程

```
对话请求
  └─► dialogue_routes.py
        ├─► memory_service.build_memory_summary_for_injection(user_id)
        │     ├─► 查询 Soul.md
        │     ├─► 查询 MEMORY.md
        │     ├─► 查询 preference（若存在数据）
        │     └─► 查询 rejection（若存在数据）
        │     └─► 组装成文本块
        └─► run_planner(memory_summary=文本块)
              └─► router.py 将 memory_summary 拼接到 ROUTER_PROMPT 之前
```

#### 4.23.5 后端 API

- `GET /api/v1/memory/soul` — 获取 Soul.md
- `POST /api/v1/memory/soul` — 保存/更新 Soul.md（upsert）
- `GET /api/v1/memory/memory` — 获取 MEMORY.md
- `POST /api/v1/memory/memory` — 保存/更新 MEMORY.md（upsert）
- `GET /api/v1/memory/summary` — 获取 prompt-ready 记忆摘要
- `GET/POST/PATCH/DELETE /api/v1/memory/preferences` — 结构化记忆 CRUD（后端保留）

#### 4.23.6 前端 UI 约束

- 设置弹窗采用 3-Tab 布局：模型配置 / 偏好设置 / 记忆设置。
- 所有 Tab 内字号不超过 `12px`，`textarea` 默认 `rows=12`。
- 不需要在 Header 新增 Icon，继续使用现有齿轮 `Settings` Icon。

### 4.24 项目持久化（FR-25）

支持 ReactFlow 画布状态的完整保存与恢复，实现跨会话、跨设备的编辑连续性。

**功能需求**：
- **项目数据模型**：`Project`（id, user_id, name, nodes, edges, viewport, settings, conversation_id, created_at, updated_at）
- **自动保存**：前端 `nodes`/`edges` 变化后 2 秒 debounce 自动保存到后端
- **刷新恢复**：页面刷新后自动加载用户最后活跃项目（`GET /projects/last/active`）
- **新建项目**：点击 Header `+` 图标清空画布，创建未命名项目
- **项目列表**："我的项目" Tab 展示所有项目卡片（缩略图、名称、节点数、更新时间）
- **项目管理**：支持重命名、删除（软删除）、切换项目
- **项目快照**：支持创建命名快照（里程碑/版本），用于回溯重要节点

**后端 API**：
- `GET /api/v1/projects` — 获取项目列表（精简版，不含 nodes/edges）
- `GET /api/v1/projects/last/active` — 获取最后活跃项目
- `GET /api/v1/projects/{id}` — 获取项目完整数据
- `POST /api/v1/projects` — 创建新项目
- `PUT /api/v1/projects/{id}` — 更新项目（自动保存）
- `DELETE /api/v1/projects/{id}` — 软删除项目
- `POST /api/v1/projects/{id}/snapshots` — 创建快照
- `GET /api/v1/projects/{id}/snapshots` — 获取快照列表

**前端交互**：
- Header Tab 新增"我的项目"，位于"AI生图库"之后
- 项目名称以纯文本展示在 Magnes Logo 旁
- 新建项目按钮为 `Plus` 图标按钮（右上角）
- 项目卡片网格布局（2/3/4/5 列响应式），与 AI 生图库风格一致

### 4.25 画布操作日志（FR-26）

记录用户在画布上的细粒度操作，用于语义检索、审计追踪和崩溃恢复。

**记录的操作类型**：

| 操作类型 | actionType | 触发场景 | 记录内容 |
|---|---|---|---|
| 对话创建工作流 | `node_create` | 对话助手生成三段式节点 | 节点类型、活动数量、模版ID、来源 |
| 拖拽添加节点 | `node_create` | 从组件库拖拽节点到画布 | 节点类型、位置、来源 |
| 删除节点 | `node_delete` | 按 Delete 或点击删除按钮 | 删除数量、节点类型列表 |
| 连接节点 | `edge_connect` | 手动拖拽连接两个节点 | source、target、handle |
| 导出图片 | `image_export` | 精细编排节点导出当前页 | 页码、总页数、图层数量 |
| 替换背景（本地上传） | `asset_replace` | 上传本地图片作为背景 | 图层类型、来源 |
| 替换背景（AI生成） | `asset_replace` | 通过 AI 生成背景图 | 图层类型、提示词、参考模式 |
| 项目保存 | `canvas_save` | 自动保存或手动保存项目 | 节点数、边数、项目名 |
| 项目创建 | `project_create` | 新建项目 | 节点数、边数、项目名 |
| 项目删除 | `project_delete` | 删除项目 | 项目名 |
| 项目重命名 | `project_rename` | 修改项目名称 | 新名称 |

**后端 API**：
- `POST /api/v1/projects/action-log` — 接收前端发送的操作日志
- `GET /api/v1/projects/action-log/history` — 查询操作日志历史（支持按类型过滤）

**实现说明**：
- 日志记录失败不影响主流程（try-catch 包裹）
- 项目保存（create/update/delete）时自动写入 CanvasActionLog
- 前端关键操作（节点创建、删除、连线、导出、背景替换）主动发送日志

### 4.26 记忆回流（FR-27）

定期分析用户的画布操作日志，自动提取偏好并写入长期记忆（UserMemory），让 AI 越用越懂用户。

**工作流程**：
```
用户操作画布 → CanvasActionLog 记录 → 定期 LLM 分析
                                              ↓
                                    提取偏好 → UserMemory
                                              ↓
                                    注入 Planner Agent system prompt
                                              ↓
                                    下次生成自动推荐用户偏好的风格/色调/布局
```

**后端 API**：
- `POST /api/v1/projects/analyze-memory` — 分析操作日志，提取偏好写入 UserMemory
- `GET /api/v1/projects/memory-analysis/preview` — 预览分析结果（不写入数据库）

**自动触发**：
- 项目自动保存成功后，每隔 5 分钟异步触发一次记忆分析
- 分析过程不阻塞用户操作，延迟 3 秒在后台执行

**可提取的偏好场景**：

| 场景 | memory_type | 示例 | 数据来源 |
|---|---|---|---|
| **主色调偏好** | `preference` | 用户连续5个项目都用粉色/暖色调背景 | `asset_replace`、`node_create` |
| **布局风格偏好** | `style` | 偏好3图并排、单图大标题、上下分割等 | `node_create`、Project.nodes结构 |
| **颜色排斥** | `rejection` | 从未使用蓝色背景，或每次都删除蓝色相关节点 | `node_delete`、`asset_replace` |
| **字体/排版偏好** | `style` | 常用粗体标题、特定字号层级、居中对齐 | 节点数据中的textStyle、fontSize |
| **工作流模式** | `workflow` | 习惯"对话→模版→精细编排"三段式，或手动拖拽组件 | `node_create`（source=conversation/drag_drop） |
| **素材来源偏好** | `preference` | 倾向本地上传 vs AI生成 vs 素材库选取 | `asset_replace`（source=local_upload/ai_generate） |
| **导出习惯** | `custom` | 总是导出多页、偏好特定分辨率 | `image_export` |
| **节点组合习惯** | `workflow` | 常把input-image → gen-image → fine-tune连起来 | `edge_connect`、`node_create` |
| **内容主题偏好** | `preference` | 经常做美食/旅行/活动海报 | `node_create`（rednote-content的活动内容） |
| **AI生成提示词风格** | `style` | 常用"春日""清新""简约"等关键词 | `asset_replace`（prompt字段） |

## 5. 非功能需求细化

### 5.1 性能

- FastAPI 接口保持无状态，生成任务通过后台异步协程执行，不阻塞请求线程。
- 图片下载与持久化使用 `aiohttp` 异步执行。
- ChromaDB 检索 P99 响应时间 ≤ 200ms（本地部署）。

### 5.2 可用性

- SQLite 读写失败时记录日志，不中断当前生成任务。
- 外部 AI API 失败时降级提示，工作流尽可能继续执行后续节点。
- 前端在 SSE 断连时显示友好提示，支持手动重新触发任务。

### 5.3 安全

- **API Key 管理**：所有 Key 存储于后端 `.env`，前端不持有任何 Key 原文。
- **API 鉴权**：所有后端接口需添加 Bearer Token 认证。
- **CORS**：生产环境 `allow_origins` 锁定为具体域名白名单。
- **输入校验**：所有 API 输入通过 Pydantic 模型校验，拒绝非法输入。

### 5.4 可维护性

- 代码分层：API 路由层 → Agent 层 → Core 工具层，职责明确。
- LLM 配置通过 `core/llm_config.py` 统一管理，一处修改全局生效。
- 所有 Agent 通过 `MagnesState` TypedDict 传递状态，类型明确，易于调试。

## 6. 环境与依赖

**后端**
- Python 3.10+
- FastAPI, Uvicorn, LangGraph, LangChain-OpenAI, SQLAlchemy, aiosqlite
- LlamaIndex, ChromaDB, rank-bm25
- aiohttp, Pillow, playwright, python-dotenv, pydantic

**前端**
- 无运行时依赖（纯静态 HTML）
- React 18, ReactFlow, Tailwind CSS, Lucide Icons（均为 CDN 加载）
- Babel（开发阶段 JSX 编译，构建产物为普通 JS）

**基础设施**
- SQLite（本地开发）→ PostgreSQL（生产推荐）
- ChromaDB（本地向量存储）
- Playwright（服务端截图，需安装 Chromium）

## 7. 约束与假设

- 假设部署环境可访问 OpenAI 兼容接口（或通过代理访问）。
- `aiosqlite` 为默认持久化方案；高并发生产环境应替换为 PostgreSQL。
- ChromaDB 默认存储于本地目录，需定期备份。
- Playwright 需单独安装浏览器二进制（`playwright install chromium`）。

## 8. 需求追踪矩阵

| 需求 | 实现模块/文件 | 测试方式 |
| ---- | ------------- | -------- |
| FR-01 | `frontend/src/app.js` + `frontend/src/nodes/rf/` | 前端手动测试 |
| FR-02 | `backend/app/core/workflow.py` + `agents/` | 集成测试 + 人工验证 |
| FR-03 | `backend/app/agents/planner/` + `frontend/src/components/ui/conversation-panel.js` | 对话意图测试 |
| FR-04 | `backend/app/api/dialogue_routes.py` + 前端 SSE 接收逻辑 | SSE 推送验证 |
| FR-05 | `frontend/src/nodes/rf/` 各节点组件 | 前端手动测试 |
| FR-06 | `backend/app/agents/painter.py` + `tools/painting_tool.py` | API Mock + 生图验收 |
| FR-07 | `backend/app/agents/slicer.py` + `tools/visual_analyzer.py` | 视觉分析验收 |
| FR-08 | `backend/app/agents/refiner.py` | 风格一致性人工验收 |
| FR-09 | `backend/app/agents/composer.py` | 排版效果人工验收 |
| FR-10 | `backend/app/agents/copy_writer.py` | 文案质量人工验收 |
| FR-11 | `backend/app/api/template_routes.py` + `app/models.py` | API 集成测试 |
| FR-12 | `backend/app/api/history_routes.py` + `app/models.py` | API 集成测试 |
| FR-13 | `backend/app/api/export_routes.py` + `core/image_generator.py` | 截图质量验收 |
| FR-14 | `frontend/src/pages/rag/rag-modals.js` + `backend/app/api/rag_routes.py` | 文案草稿箱与润色功能测试 |
| FR-15 | `backend/app/tools/xhs_mcp_tools.py` + `backend/app/agents/inspiration_analyst.py` | 小红书搜索与灵感分析测试 |
| FR-16 | `backend/app/skills/ecommerce_manager.py` + `.agent/skills/ecommerce-image-gen/` | 电商生图 Skill 测试 |
| FR-17 | `backend/app/rag/` | RAG 知识库与检索精度测试 |
| FR-18 | `backend/app/api/mcp_routes.py` + `core/mcp_client.py` | MCP 工具调用测试 |
| FR-19 | `backend/app/agents/security_check.py` | 敏感词命中率测试 |
| FR-20 | `frontend/src/nodes/rednote/stylelab-node.js` | 前端手动测试 |
| FR-21 | `backend/app/agents/` 目录下各智能体实现 | 智能体协作流程测试 + 集成验证 |
| FR-22 | `backend/app/api/auth.py` + `backend/app/core/users.py` | 登录/注册/Token 验证测试 |
| FR-23 | `frontend/src/nodes/rf/fine-tune-node-rf.js` | 精细编排功能手动测试 |
| FR-24 | `backend/app/api/painter_routes.py` | AI 绘图接口测试 |
| FR-MEM-01 | `backend/app/memory/service.py` + `backend/app/agents/planner/router.py` | 记忆注入验证 |
| FR-MEM-02 | `frontend/src/components/layout/AppModals.js` | Soul.md 编辑与保存测试 |
| FR-MEM-03 | `frontend/src/components/layout/AppModals.js` | MEMORY.md 编辑与保存测试 |
| FR-MEM-04 | `backend/app/memory/routes.py` | 结构化记忆 CRUD API 测试 |
| FR-25 | `backend/app/api/project_routes.py` + `frontend/src/app.js` | 项目持久化：创建/保存/切换/删除/快照 |
| FR-26 | `backend/app/api/project_routes.py` + `frontend/src/hooks/` | CanvasActionLog 操作日志记录与查询 |
| FR-27 | `backend/app/api/project_routes.py` + `backend/app/memory/models.py` | 记忆回流：LLM 分析日志 → 提取偏好 → UserMemory |
| FR-03-EXT | `backend/app/agents/planner/nodes/planner_agent.py` | Fast Path 与意图识别测试 |
| NFR-01 | FastAPI + Uvicorn 配置 | 性能压测 |
| NFR-03 | `GET /` 根路径健康检查 | 功能测试 |
| NFR-07 | `backend/app/core/llm_config.py` | 切换 Provider 验证 |

---

> 本说明书适用于需求评审与验收，详细技术设计见 `03_system_design.md`，部署计划见 `06_deployment_and_operations.md`。
