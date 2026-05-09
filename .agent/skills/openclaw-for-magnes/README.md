# OpenClaw for Magnes

整合 xiaohongshu-skills 和 Magnes 后端，提供从搜索到海报生成的完整工作流。

## 功能

- 🔍 **搜索小红书** - 使用 xiaohongshu-skills 搜索笔记
- 📊 **分析总结** - 提取结构化市集信息
- 🎨 **生成海报** - 调用 Magnes 后端生成图文海报

## 工作流程

```
用户: "搜索小红书热门市集"
  ↓
OpenClaw → xiaohongshu-skills → 搜索+获取详情 → 保存 JSON
  ↓
用户: "总结6个市集"
  ↓
OpenClaw → 分析 JSON → 提取结构化信息 → 保存 JSON
  ↓
用户: "生成海报"
  ↓
OpenClaw → Magnes 后端 → 生成海报图片
```

## 使用方式

### 1. 搜索
```
用户: "帮我搜索小红书上海三月热门市集"
```

### 2. 总结
```
用户: "帮我总结6个市集"
```

### 3. 生成海报
```
用户: "生成第1个市集的海报"
→ 选择模版
→ 获得海报
```

## 依赖

- Python 3.11+
- xiaohongshu-skills (同目录)
- Magnes 后端 (http://localhost:8088)
- Chrome 浏览器

## 目录结构

```
openclaw-for-magnes/
├── SKILL.md              # 技能文档
├── skill.json            # 配置
├── README.md             # 本文件
├── EXAMPLES.md           # 示例文档
├── data/                 # 数据目录
└── xiaohongshu-skills/   # 依赖（只读）
```

## 配置

在 `skill.json` 中修改：

```json
{
  "xiaohongshu_skills_path": "./xiaohongshu-skills",
  "magnes_api_url": "http://localhost:8088",
  "data_dir": "./data"
}
```
