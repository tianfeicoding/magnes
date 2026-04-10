# OpenClaw for Magnes - 跨平台使用指南

## 快速调用

### 1. 在终端中使用

```bash
# 添加 alias 到 ~/.zshrc 或 ~/.bashrc
alias magnes="/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/openclaw-for-magnes/openclaw-for-magnes.sh"

# 搜索
magnes search "上海三月市集"

# 完整流程 (搜索+提取+生成海报)
magnes full "北京周末活动"
```

### 2. 在 Alfred 中使用 (macOS)

1. 创建 Alfred Workflow
2. 添加 "Run Script" 动作
3. 脚本内容:
```bash
/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/openclaw-for-magnes/openclaw-for-magnes.sh full "{query}"
```
4. 设置关键词如 `magnes`
5. 使用: 在 Alfred 输入 `magnes 上海三月市集`

### 3. 在 Raycast 中使用 (macOS)

1. 创建 Raycast Script Command
2. 脚本路径指向 `openclaw-for-magnes.sh`
3. 设置参数传递方式
4. 使用: 在 Raycast 输入命令

### 4. 在微信中使用

#### 方式 A: 通过 OpenClaw 微信助手

1. 添加 OpenClaw 微信助手为好友
2. 发送消息:
```
@小爪 搜索小红书上海三月市集
```
3. 根据提示完成后续操作

#### 方式 B: 转发链接

1. 在微信中看到小红书笔记链接
2. 转发给 OpenClaw 助手
3. 自动识别并调用 skill

### 5. 在 OpenClaw 中使用

#### 方式 A: 自然语言
```
帮我搜索小红书上海热门市集
```

#### 方式 B: 命令触发
```
@openclaw-for-magnes 搜索上海三月市集
```

#### 方式 C: 技能选择器
1. 输入 `/skills`
2. 选择 "openclaw-for-magnes"
3. 输入关键词

### 6. 在 Magnes 前端中使用

1. 打开 Magnes 前端界面
2. 点击 "小红书搜索" 按钮
3. 输入关键词
4. 选择活动生成海报

### 7. 在其他应用中调用

#### HTTP API (需要 OpenClaw 配置)
```bash
curl -X POST http://localhost:8000/api/skills/openclaw-for-magnes \
  -H "Content-Type: application/json" \
  -d '{
    "action": "search",
    "keyword": "上海三月市集"
  }'
```

#### Apple Shortcuts (iOS/macOS)
1. 创建快捷指令
2. 添加 "Run Shell Script" 动作
3. 输入脚本路径和参数
4. 通过 Siri 触发

#### Keyboard Maestro
1. 创建 Macro
2. 添加 "Execute Shell Script" 动作
3. 设置触发快捷键
4. 快速调用

## 文件结构

```
openclaw-for-magnes/
├── openclaw-for-magnes.sh    # 快捷调用脚本
├── SKILL.md                   # 技能文档
├── scripts/
│   ├── search_and_save.py     # 搜索
│   ├── event_extractor.py     # 提取活动
│   └── generate_poster_precise.py  # 生成海报
└── data/
    └── poster_precise_blocks.png   # 生成的海报
```

## 环境要求

- Python 3.11+
- macOS / Linux
- Chrome 浏览器 (用于小红书操作)
- 可选: Alfred, Raycast, Keyboard Maestro 等工具

## 常见问题

### Q: 在微信中如何快速调用?
A: 最简单的方式是添加 OpenClaw 微信助手，然后直接发送 `@小爪 搜索小红书上海市集`

### Q: 可以设置快捷指令吗?
A: 可以，使用 `openclaw-for-magnes.sh` 脚本，配合 Alfred、Raycast 或 Keyboard Maestro

### Q: 生成的海报在哪里?
A: `data/poster_precise_blocks.png`，脚本会自动打开

### Q: 如何修改默认参数?
A: 编辑 `openclaw-for-magnes.sh` 脚本中的变量
