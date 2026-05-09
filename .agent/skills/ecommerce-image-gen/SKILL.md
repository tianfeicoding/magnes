---
name: ecommerce-image-gen
description: |
  电商商品图片分析与主图生成工作流。当用户上传商品图片时使用此 Skill，自动识别商品类型和所属分类，询问是否生成商品主图，支持用户提供参考图，最终输出可直接用于电商平台的高质量主图生成 Prompt 及调用结果。
  触发场景：
  - 用户上传一张或多张商品图片，询问"帮我生成主图""分析这是什么商品"等
  - 用户说"电商图片""商品主图""产品图"相关需求
  - 用户希望对图片做电商场景的图像生成或优化
---

# 电商商品图片生成 Skill

## Skill 注册表

用户上传图片后，系统自动匹配可用 Skill 并以标签形式展示。当前注册的 Skill：

| 标签显示 | Skill ID | 触发条件 |
|----------|----------|----------|
| 电商生图Skill | `ecommerce-image-gen` | 用户上传任意商品图片 |

> 后续新增 Skill 时，在此表格追加一行即可。

---

## 工作流程

### Step 0：图片上传检测 → 展示 Skill 标签

用户在对话框上传图片后，**不要立即分析图片**，先回复：

```
试试看：[电商生图Skill]
```

- `[电商生图Skill]` 为可点击标签，前端渲染为按钮样式
- 若注册表中有多个 Skill，逐一列出：`试试看：[Skill A] [Skill B]`
- 等待用户点击标签，点击后进入对应 Skill 的正式流程

### Step 1：识别商品

用户点击 `[电商生图Skill]` 标签后，使用视觉能力分析图片，输出：

```
商品识别结果：
- 商品名称：[具体名称]
- 商品分类：[分类名称]
- 核心特征：[颜色/材质/风格/用途等关键描述]
```

然后询问：**"是否需要为该商品生成电商主图？"**

### Step 2：收集参考图（可选）

若用户确认生成主图，询问：
> "您可以提供 1-3 张参考图（竞品图、风格参考图、背景参考图），将用于指导主图风格生成。若无参考图，我将根据商品分类的默认风格生成。"

**内置参考图（优先使用）：** `assets/reference-images/<分类ID>/` 目录下存放了对应分类的参考图，若用户未上传参考图，自动使用此目录下的图片作为风格参考。

等待用户上传参考图或跳过。

### Step 3：生成主图 Prompt

根据以下要素构建生成 Prompt：

1. **商品特征**（来自 Step 1 识别）：保持图 1 中的产品细节 100% 一致。
2. **分类风格规范**（加载 `references/categories.md` 配置）。
3. **风格引用原则**：
   - **严禁**：在未得到用户确认的情况下，尝试通过文字“猜写”参考图中的具体物体（如：marble, silk, flower petals 等）。
   - **强制**：如果有参考图（Image 2），直接在 Prompt 中使用描述性引用语句，如：`Follow the composition and background style of Image 2`, `Inherit the lighting and mood from Image 2`。
   - **权重**：在调用接口时，务必携带权重参数 `var`（见 Planner 提示词规范）。

**Prompt 结构模板：**
```
[Product Details from Image 1], [Composition and Background reference to Image 2], [Lighting/Mood reference to Image 2], commercial product photography, 4K quality
```

### Step 4：调用图像生成 API

按照配置调用图像生成服务（详见 `references/integration.md` 中的 API 调用说明）。

- 若项目已配置 API Key，直接调用并返回生成图片
- 若未配置，输出完整 Prompt 供用户手动使用

### Step 5：交付结果

返回：
```
生成结果：
- 使用分类：[分类名]
- 生成 Prompt：[完整英文 Prompt]
- 图片结果：[URL 或 Base64 或 "请使用上方 Prompt 在图像生成平台生成"]
- 建议规格：[平台对应尺寸]
```

---

## 商品分类

商品分类配置见 `references/categories.md`，包含每个分类的：
- 场景风格
- 背景偏好
- 光线要求
- Prompt 模板
- 平台规格建议

当识别到商品后，加载对应分类配置来指导 Prompt 生成。

---

## 集成说明

如何在外部项目中调用此 Skill，见 `references/integration.md`。
