s# Magnes Studio UI 设计规范 (Workspace Workspace Edition)

本规范专门针对 Magnes Studio 的“功能性工作台” (如视觉反推控制台、编辑器面板等) 制定。与基础的 Monochrome 规范相比，工作台版本更强调**高信息密度**、**精密对齐**以及**生产力级别的状态反馈**。

---

## 1. 布局布局逻辑 (Layout & Spatial Logic)
工作台旨在实现首屏信息利用率最大化：
*   **卡片内边距 (Card Padding)**：全站卡片 (Panel) 内部 Padding 统一为 `10px`。
*   **标题与内容间距**：面板标题 (`.card-header`) 与其内容区域的间距精准固定为 `10px`。
*   **工作台内边距**：右侧操作区的全局 Padding 为 `10px`。
*   **装饰线控制**：移除标题下方的横线装饰，通过 `10px` 的物理间距形成天然的视觉区隔。

## 2. 按钮组件规范 (Button Component)
工作台按钮需具备高度的视觉一致性：
*   **统一高度**：标准高度固定为 `32px`。
*   **字号标准**：按钮内文字统一使用 `11px`，加粗显示。
*   **内边距 (Padding)**：左右内边距为 `16px`。
*   **禁用状态 (Disabled State)**：
    *   **背景色**：使用 `#f4f4f5` (Zinc-100)。
    *   **文字色**：必须使用 **`#71717a` (Zinc-500)**，以确保在禁用状态下功能标签依然具有极高的可识别性。
    *   **边框**：`1px solid #e4e4e7`。

## 3. 图标与对齐 (Icons & Alignment)
*   **图标尺寸**：
    *   按钮内图标：`12px`。
    *   全局设置图标：`18px`。
*   **对齐协议 (Alignment Protocol)**：
    *   所有图标、文字及相邻按钮必须执行严格的 `flex items-center` 垂直居中对齐。
    *   设置图标等交互容器应通过 `32px` 的宽高容器进行包裹，以确保其重心与标准按钮保持一致。

## 4. 编辑器视觉风格 (Editor Aesthetic)
*   **无界编辑器 (Borderless Area)**：在审美分析报告等输出面板中，`textarea` 应移除边框 (`border-none`) 和内边距 (`p-0`)，使文字直接基于卡片底色呈现，增强“图纸感”。
*   **等宽字体**：源码视图及 JSON 编辑区必须使用 `JetBrains Mono` 或 `Geist Mono`，字号固定为 `12px`。

## 5. 颜色与对比度 (Colors)
*   **主色调**：单色系，黑色 (`#000`) 锚定，白色 (`#fff`) 衬底。
*   **次要边框**：统一使用 `#e4e4e7` (Zinc-200)。
*   **背景渲染**：预览区域背景使用 `#f0f0f0` 或 `#fcfcfc` 以区分纯白卡片容器。

---
*更新日期：2026年1月24日*
*风格版本：Workspace Optimization V1.0 (Refiner Standard)*
