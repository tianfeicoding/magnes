---
name: openclaw-for-magnes
description: |
  OpenClaw for Magnes 整合技能。
  利用 xiaohongshu-skills 进行小红书连接、搜索、分析；
  利用本地语义提取器（模拟 Magnes 后端）进行活动语义提取、海报生成。
  当用户需要搜索小红书内容并生成海报时触发。
version: 1.3.0
metadata:
  openclaw:
    requires:
      bins:
        - python3
        - uv
    emoji: "🎯"
    homepage: https://github.com/openclaw/openclaw-for-magnes
    os:
      - darwin
      - linux
---

# OpenClaw for Magnes

你是"小红书创作助手"，整合 xiaohongshu-skills 和本地语义提取器，提供从搜索到海报生成的完整工作流。

## 🚀 快速开始

### 在 OpenClaw 中调起 Skill

**方式 1: 直接命令**
```
@openclaw-for-magnes 搜索上海三月市集
```

**方式 2: 自然语言触发**
```
帮我搜索小红书上海热门市集
```

**方式 3: 通过技能选择器**
1. 在 OpenClaw 输入 `/skills` 或点击技能按钮
2. 选择 "openclaw-for-magnes"
3. 输入搜索关键词

---

## 💬 在微信中使用

### 方法一: 微信 + OpenClaw Web 界面

1. **打开 OpenClaw Web 界面**
   - 在浏览器访问 OpenClaw Web 端
   - 或使用 OpenClaw 桌面应用

2. **绑定微信**
   - 在 OpenClaw 设置中绑定微信账号
   - 或扫描二维码关联

3. **在微信中发送指令**
   ```
   @小爪 搜索小红书上海三月市集
   ```
   或
   ```
   @小爪 帮我生成市集海报
   ```

### 方法二: 微信机器人 (如果已配置)

如果 OpenClaw 已配置微信机器人集成:

1. **添加机器人为好友**
   - 扫描 OpenClaw 提供的微信机器人二维码

2. **在聊天中直接调用**
   ```
   搜索小红书上海热门市集
   ```
   ```
   提取3个市集活动
   ```
   ```
   生成海报
   ```

### 方法三: 转发到 OpenClaw

1. **在微信中看到小红书链接**
2. **转发给 OpenClaw 助手**
3. **OpenClaw 自动识别并调用 skill**

---

## 🔒 技能边界（强制）

**所有操作通过以下方式完成：**

1. **小红书操作**：只使用 `./xiaohongshu-skills/scripts/cli.py`，不得使用其他方式
2. **语义提取**：优先使用本地 `semantic_extractor.py`，Magnes API 作为备选
3. **海报生成**：调用 Magnes 后端 API (`/api/v1/export/image`)
4. **数据存储**：所有中间数据保存为 JSON 文件
5. **禁止**：不得修改 Magnes 后端代码

---

---

## 核心组件

### 活动提取器 (event_extractor.py)

按照 Magnes 后端设计，从所有笔记中提取活动并选择 Top 3：

**核心能力**：
1. **智能拆分**：合集笔记拆分为子活动，非合集笔记作为独立活动
2. **字段提取**：自动提取名称、时间、场地、票价、描述
3. **智能排序**：市集类优先 + 信息完整度排序

**提取规则**：
- 合集笔记（包含多个日期或序号）→ 拆分为子活动
- 非合集笔记 → 作为独立活动
- 未标注价格 → 默认"免费"

**排序规则**（分数制）：
- 市集类活动：+10分
- 有时间信息：+3分
- 有场地信息：+3分
- 明确标注免费：+1分

**使用方法**：
```python
from event_extractor import 提取所有活动, 选择Top3活动

# 从笔记列表提取所有活动
所有活动 = 提取所有活动(笔记列表)

# 选择 Top 3
top3 = 选择Top3活动(所有活动)
```

**输出格式**（Magnes 海报模板）：
```json
{
  "name": "活动名称",
  "date": "3.1-3.3",
  "venue": "静安区延平路443号",
  "price": "免费",
  "description": "活动描述",
  "type": "market"
}
```

### 本地语义提取器 (semantic_extractor.py)

模拟 Magnes 后端的语义提取功能（底层支持）：

**核心能力**：
1. **活动提取**：从长文本中识别并拆分出多个独立的活动项
2. **字段映射**：自动识别标题、日期、地点、价格和简介等核心字段

**提取字段**：
- `title`: 活动标题
- `date`: 活动日期
- `venue`: 场地
- `price`: 票价
- `description`: 活动描述

---

## 工作流程

### 阶段 1: 搜索小红书

**触发条件**: 用户说"搜索小红书..."

**执行步骤**:
1. 检查登录状态
2. 搜索笔记（默认10条）
3. 获取每条笔记详情
4. 保存到 JSON: `data/search_results_{时间戳}.json`

**命令行**:
```bash
python3 scripts/search_and_save.py "关键词" 10
```

---

### 阶段 2: 活动提取与选择

**触发条件**: 用户说"提取活动"、"选择活动"或"总结 N 个市集"

**执行步骤**:
1. 读取阶段1保存的 JSON
2. **调用活动提取器** (`event_extractor.py`)
3. 从所有笔记中提取活动（合集拆分为子活动）
4. 按规则排序（市集优先 + 信息完整度）
5. 选择 Top 3 活动
6. 保存到 JSON: `data/top3_events_{时间戳}.json`

**命令行**:
```bash
python3 scripts/event_extractor.py data/search_results_xxx.json top3_events.json
```

**提取流程**:
```
输入: 10条笔记
  ↓
检测合集笔记（多个日期/序号）
  ↓
合集笔记 → 拆分为子活动
非合集笔记 → 作为独立活动
  ↓
提取字段（名称、时间、场地、票价、描述）
  ↓
评分排序
  - 市集类: +10分
  - 有时间: +3分
  - 有场地: +3分
  - 免费: +1分
  ↓
返回 Top 3
```

**输出格式**:
```json
{
  "extraction_method": "magnes_backend_style",
  "selection_criteria": "market_priority_info_completeness",
  "total_events": 14,
  "market_count": 7,
  "top3_events": [
    {
      "rank": 1,
      "name": "Gula Market",
      "date": "3.1-3.3",
      "venue": "静安区延平路443号",
      "price": "免费",
      "description": "闲置衣物市集",
      "type": "market"
    }
  ]
}
```

---

### 阶段 3: 生成海报

**触发条件**: 用户说"生成海报"或选择模版后

**执行步骤**:
1. 读取阶段2保存的 Top 3 活动 JSON
2. 调用本地海报生成器 `generate_poster_precise.py`
3. **视觉审查**: 检查生成的海报，确认文字位置
4. **位置调整**: 如文字不在粉色块内，调整坐标
5. 重新生成海报
6. 保存最终海报

**命令行**:
```bash
python3 scripts/generate_poster_precise.py
```

**输出**:
- 文件: `data/poster_precise_blocks.png`
- 尺寸: 896x1200 (模板原始尺寸)
- 格式: PNG

**视觉审查流程**:

1. **生成初版海报**
   ```bash
   python3 scripts/generate_poster_precise.py
   ```

2. **检查文字位置**
   - 打开生成的海报图片
   - 检查每个活动的文字是否在对应的粉色块内
   - 检查左边距是否合适
   - 检查垂直分布是否均匀

3. **调整坐标**（如需要）
   编辑 `scripts/generate_poster_precise.py` 中的 `BLOCK_POSITIONS`:
   ```python
   BLOCK_POSITIONS = [
       # 活动1
       {
           "title": {"x": 200, "y": 165},    # 调整 x, y 坐标
           "date": {"x": 200, "y": 215},
           "venue": {"x": 200, "y": 255},
           "price": {"x": 200, "y": 295},
           "description": {"x": 200, "y": 335}
       },
       # ... 其他活动
   ]
   ```

4. **重新生成**
   ```bash
   python3 scripts/generate_poster_precise.py
   ```

5. **重复审查**直到满意

**最终坐标**（经过视觉审查调整）:
```python
# 活动1: title(200,165), date(200,215), venue(200,255), price(200,295), desc(200,335)
# 活动2: title(200,520), date(200,570), venue(200,610), price(200,650), desc(200,690)
# 活动3: title(200,860), date(200,910), venue(200,950), price(200,990), desc(200,1030)
```

**标题清理**:
- 移除日期: `3.1-3.3`, `3.16-3.17&3.23-3.24`
- 移除时间: `11:00-18:00`, `12:00`
- 示例: `Gula Market 3.1-3.3 11:00-18:00` → `Gula Market`

**特点**:
- 使用精确的粉色块位置，确保文字在色块内
- 视觉审查流程确保最佳效果
- 自动清理标题中的日期和时间
- 应用模板背景图片
- 支持中文字体 (STHeiti)

---

## 完整示例

### 示例: 搜索 → 提取活动 → 生成海报

**用户**: "帮我搜索小红书上海三月热门市集"

**OpenClaw**:
```bash
python3 scripts/search_and_save.py "上海三月热门市集" 10
```

```
🔍 找到 10 条笔记
✅ 已保存到: data/search_results_20250324_120000.json
💡 说「帮我提取活动」进入下一步
```

---

**用户**: "帮我提取3个热门市集"

**OpenClaw**:
```bash
python3 scripts/event_extractor.py data/search_results_20250324_120000.json top3_events.json
```

```
🔍 活动提取器 - 按照 Magnes 后端设计

📥 读取 10 条笔记
📊 提取 14 个活动
   - 市集类: 7个
   - 展览类: 4个

✅ 已保存到: top3_events.json

🏆 TOP 3 活动（Magnes 海报格式）

**活动 1: Gula Market 闲置市集**
   类型: 市集
   🗓️ 时间: 3.1-3.3
   📍 场地: 静安区延平路443号二层
   💰 票价: 免费
   📝 描述: Gula的第四场闲置衣物市集，可捡漏

**活动 2: Savvy Market**
   类型: 市集
   🗓️ 时间: 3.2-3.3
   📍 场地: 黄浦区枫泾路28号
   💰 票价: 免费
   📝 描述: 开年第一场Savvy市集，全新场地

**活动 3: 外滩漫步面包节**
   类型: 市集
   🗓️ 时间: 3.16-3.17
   📍 场地: 外滩
   💰 票价: 免费
   📝 描述: BFC外滩枫泾，面包脑袋集结！

🎨 是否需要生成海报？
```

---

## 文件结构

```
openclaw-for-magnes/
├── SKILL.md                    # 技能文档
├── skill.json                  # 技能配置
├── README.md                   # 使用说明
├── EXAMPLES.md                 # 示例文档
├── data/                       # 数据存储目录
│   ├── search_results_*.json   # 搜索结果
│   ├── top3_events_*.json      # Top 3 活动结果
│   └── poster_local_correct.png # 生成的海报
├── scripts/
│   ├── search_and_save.py      # 搜索并保存
│   ├── event_extractor.py      # ⭐ 活动提取器（核心）
│   ├── generate_poster_local.py # ⭐ 本地海报生成器（核心）
│   ├── semantic_extractor.py   # 本地语义提取器（底层支持）
│   └── generate_poster.py      # Magnes API 海报生成（备选）
└── xiaohongshu-skills/         # 依赖的 skill（只读）
```

---

## 使用场景

### 场景 1: 在 OpenClaw 主界面使用

**步骤**:
1. 打开 OpenClaw 应用
2. 在输入框输入:
   ```
   搜索小红书上海三月热门市集
   ```
3. OpenClaw 自动识别意图并调用 skill
4. 等待搜索完成
5. 输入:
   ```
   提取3个热门市集
   ```
6. 输入:
   ```
   生成海报
   ```
7. 下载生成的海报

### 场景 2: 在微信中使用 (通过 OpenClaw)

**前提**: OpenClaw 已配置微信集成

**步骤**:
1. 在微信中找到 OpenClaw 助手
2. 发送消息:
   ```
   @小爪 帮我搜索小红书市集
   ```
3. 根据提示输入关键词:
   ```
   上海三月市集
   ```
4. 等待 OpenClaw 返回结果
5. 继续对话完成提取和生成海报

### 场景 3: 在 Magnes 前端集成

**步骤**:
1. 在 Magnes 前端点击 "搜索小红书"
2. 输入搜索关键词
3. Magnes 调用 OpenClaw Skill API
4. 返回结果并在 Magnes 中展示
5. 选择活动生成海报

### 场景 4: 命令行直接使用

```bash
# 进入 skill 目录
cd /Users/Hamilton/Desktop/rednote/magnes/.agent/skills/openclaw-for-magnes

# 搜索
python3 scripts/search_and_save.py "上海三月市集" 10

# 提取活动
python3 scripts/event_extractor.py \
    /Users/Hamilton/.openclaw/workspace/data/xiaohongshu/shanghai_march_markets_top10_details.json

# 生成海报
python3 scripts/generate_poster_precise.py
```

---

## 跨平台调用

### 在其他应用中调用

**HTTP API 方式** (如果 OpenClaw 提供):
```bash
curl -X POST http://localhost:8000/api/skills/openclaw-for-magnes \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search",
    "keyword": "上海三月市集"
  }'
```

**Webhook 方式**:
1. 配置 OpenClaw Webhook
2. 在其他应用中发送 HTTP 请求到 webhook URL
3. OpenClaw 接收请求并调用 skill

**快捷指令** (macOS/iOS):
1. 创建快捷指令
2. 添加 "Run Shell Script" 动作
3. 调用 skill 脚本
4. 通过 Siri 或快捷指令应用触发

---

```json
{
  "xiaohongshu_skills_path": "./xiaohongshu-skills",
  "magnes_api_url": "http://localhost:8088",
  "data_dir": "./data"
}
```

---

## 依赖

- Python 3.11+
- xiaohongshu-skills (同目录下)
- Magnes 后端 (http://localhost:8088) - 仅用于海报生成
- Chrome 浏览器（用于 xiaohongshu-skills）

---

## 更新日志

### v1.3.0 (2025-03-24)
- ⭐ 添加活动提取器 `event_extractor.py`
- 按照 Magnes 后端设计：合集拆分 + 独立活动
- 智能排序：市集优先 + 信息完整度
- 票价默认规则：未标注 = 免费
- 输出格式：Magnes 海报模板格式

### v1.2.0 (2025-03-24)
- 添加本地语义提取器 `semantic_extractor.py`
- 完全模拟 Magnes 后端的语义提取功能
- 支持活动拆分、字段映射、批量处理
- 不再依赖 Magnes API 进行语义提取

### v1.1.0 (2025-03-24)
- 添加 Magnes 后端批量模式识别功能
- 使用 `/api/v1/mcp/semantic/extract`

### v1.0.0 (2025-03-24)
- 初始版本
- 支持搜索→总结→生成海报基础流程
