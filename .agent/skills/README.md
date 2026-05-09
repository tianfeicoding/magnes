# Rednote 项目 Skills

## 目录说明

此目录用于存放 **工作区特定的 Skills**,这些技能仅在当前 Rednote 项目中可用。

## Skills 位置

根据 Antigravity 文档,Skills 有两种类型:

| 位置 | 作用域 | 路径 |
|------|--------|------|
| **工作区特定** | 仅在特定项目中可用 | `<workspace-root>/.agent/skills/<skill-folder>/` |
| **全局** | 在所有工作区中可用 | `~/.gemini/antigravity/global_skills/<skill-folder>/` |

## 当前项目 Skills

目前此目录为空。你可以在这里添加 Rednote 项目特定的技能,例如:

- Magnes Studio 特定的开发流程
- Rednote AI Agent 的架构规范
- 项目特定的部署检查清单
- 团队协作规范

## 目录结构

每个 skill 应该有自己的子目录,包含:

```
.agent/skills/
├── <skill-name-1>/
│   ├── SKILL.md        # 必需:技能定义文件
│   ├── script.py       # 可选:辅助脚本
│   └── resources/      # 可选:资源文件
└── <skill-name-2>/
    └── SKILL.md
```

## SKILL.md 格式

每个技能的 `SKILL.md` 文件必须包含 YAML frontmatter 和 Markdown 内容:

```markdown
---
name: skill-identifier
description: 简短描述技能的作用和使用场景。Agent 会根据此描述决定是否激活该技能。
---

# 技能标题

## 详细说明
技能的具体指令、检查清单或操作步骤...
```

## 注意事项

- ⚠️ 此目录中的 skills 仅在 Rednote 项目中生效
- ⚠️ 如需跨项目使用的通用技能,请添加到全局目录: `~/.gemini/antigravity/global_skills/`
- ⚠️ 项目 skills 的优先级高于全局 skills

## 参考资源

- [Antigravity Skills 文档](https://antigravity.google/docs/skills)
- 全局 Skills 目录: `~/.gemini/antigravity/global_skills/`
