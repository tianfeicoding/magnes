# OpenClaw for Magnes - 使用示例

## 完整工作流示例

### 步骤 1: 搜索小红书

**用户输入**:
```
帮我搜索小红书上海三月热门市集
```

**OpenClaw 执行**:
```bash
cd /Users/Hamilton/Desktop/rednote/magnes/.agent/skills/openclaw-for-magnes
python3 scripts/search_and_save.py "上海三月热门市集" 10
```

**输出**:
```
🔍 搜索: 上海三月热门市集 (数量=10)
✓ 找到 10 条笔记

[1/10] 获取详情: 69a921f7000000002203bd34
  等待5秒...
[2/10] 获取详情: 65e072120000000004000f19
  ...

✅ 已保存到: data/search_results_20250324_120000.json
  成功: 10/10

OUTPUT_FILE:data/search_results_20250324_120000.json
```

**展示给用户**:
```
🔍 找到 10 条关于「上海三月热门市集」的笔记：

1. **淮海中路女子市集** - 👍 2177
2. **上海3月免费市集** - 👍 1858
3. **上海周末出逃计划** - 👍 1459
...

✅ 已保存详情到: data/search_results_20250324_120000.json
💡 说「帮我总结6个市集」进入下一步
```

---

### 步骤 2: 总结市集信息

**用户输入**:
```
帮我总结6个市集
```

**OpenClaw 执行**:
```bash
python3 scripts/summarize_events.py data/search_results_20250324_120000.json 6
```

**输出**:
```
📊 总结 6 个市集信息...
  来源: data/search_results_20250324_120000.json
✅ 已保存到: data/summarized_events_20250324_120500.json

📋 为你精选 6 个市集：

**1. 淮海中路女子市集**
📍 淮海中路
🗓️ 3月8日-3月10日
✨ 全女市集，充满女性力量，可免费领取冰箱贴、胸针、贴纸
👥 女性消费者

**2. Gula Market 闲置市集**
📍 静安区延平路443号
🗓️ 3月1日-3月3日
✨ 闲置衣物市集，上次成功捡了漏
👥 喜欢淘货的人群

...

🎨 是否需要生成海报？
回复「要」或指定市集（如「生成第1个的海报」）

OUTPUT_FILE:data/summarized_events_20250324_120500.json
```

---

### 步骤 3a: 列出模版

**用户输入**:
```
要
```

**OpenClaw 执行**:
```bash
python3 scripts/generate_poster.py --list-templates
```

**输出**:
```
🎨 请选择海报模版：

[1] 清新文艺风 - 适合展览、书店、咖啡探店
[2] 潮流时尚风 - 适合潮牌、买手店、快闪店
[3] 可爱萌系风 - 适合萌宠、甜品、手作市集
[4] 高端简约风 - 适合艺术展、奢侈品、高端餐饮
[5] 活力运动风 - 适合户外、运动、音乐节
[6] 复古胶片风 - 适合 vintage、复古市集、老建筑

请回复数字 1-6 选择模版

TEMPLATE_IDS:["fresh_art", "trendy", "cute", "minimal", "sporty", "vintage"]
```

---

### 步骤 3b: 生成海报

**用户输入**:
```
选1
```

**OpenClaw 执行**:
```bash
python3 scripts/generate_poster.py data/summarized_events_20250324_120500.json 1
```

**输出**:
```
🖼️ 正在使用「清新文艺风」生成海报...
✅ 海报生成完成!
  模版: 清新文艺风
  市集: 淮海中路女子市集

OUTPUT_FILE:data/poster_fresh_art.png
```

**展示给用户**:
```
✅ 海报生成完成！

📱 使用模版：清新文艺风
📊 包含市集：淮海中路女子市集

[图片]

💡 需要调整内容或换模版重新生成吗？
```

---

## 快捷指令

| 指令 | 功能 |
|------|------|
| `搜索小红书...` | 阶段1：搜索笔记 |
| `总结N个市集` | 阶段2：总结信息 |
| `生成海报` | 阶段3：生成海报 |
| `选N` | 选择第N个模版 |

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `data/search_results_*.json` | 搜索结果（含详情） |
| `data/summarized_events_*.json` | 总结的市集信息 |
| `data/poster_*.png` | 生成的海报图片 |
