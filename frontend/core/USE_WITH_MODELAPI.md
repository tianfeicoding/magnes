# 使用 modelapi Rednote API 指南

## 🎯 场景

当使用 Rednote 特定的 API 功能时（如智能配色、AI 换背景等），可以引入 modelapi 的相关模块。

## 📦 可用的 modelapi 功能

### 1. API 调用辅助函数

**文件**: `modelapi/api-config-manager.js`

**功能**:
- `callChatAPI()` - 调用 Chat API
- `callImageAPI()` - 调用 Image API
- `pollTaskStatus()` - 轮询任务状态
- `imageUrlToBase64()` - 图片 URL 转 Base64

### 2. 图片生成助手

**文件**: `modelapi/image-generation-helper.js`

**功能**:
- 图片生成统一接口
- NanoBana 异步任务处理
- 即梦模型特殊处理

### 3. Rednote API 集成

**文件**: `modelapi/rednote-api-integration-example.js`

**功能**:
- `extractColorFromImage()` - 智能配色提取
- `generateBackground()` - AI 换背景
- Rednote 节点专用 API

---

## 🚀 引入方式

### 方式 1: 引入完整 api-config-manager（推荐用于测试）

**优点**: 功能完整  
**缺点**: 包含与 baseapi 重复的配置管理代码

### 方式 2: 仅引入辅助函数（待实现）

创建 `modelapi/api-helpers.js`，仅包含 API 调用函数，不包含配置管理：

```javascript
// modelapi/api-helpers.js
// 从 api-config-manager.js 提取纯函数
export {
    callChatAPI,
    callImageAPI,
    pollTaskStatus,
    imageUrlToBase64
};
```

```html

<script src="modelapi/api-helpers.js"></script>
```

### 方式 3: 引入 Rednote 集成（按需）

```html
<!-- 仅当需要 Rednote 特定功能时 -->
<script src="modelapi/image-generation-helper.js"></script>
<script src="modelapi/rednote-api-integration-example.js"></script>
```

---

## 📝 使用示例

### 示例 1: 调用 Image API

```javascript
// 在React 组件中
const { useMagnesContext } = window.MagnesComponents.Context;

function MyComponent() {
    const { apiConfigs, apiConfigsMap } = useMagnesContext();

    const generateImage = async () => {
        // 1. 获取模型配置
        const config = apiConfigsMap.get('nano-banana-2');
        
        // 2. 调用 API（使用 modelapi 的辅助函数）
        const result = await window.APIConfigManager.callImageAPI(
            config,
            config.key,
            '一只可爱的猫',
            { size: '1024x1024' }
        );
        
        console.log('生成的图片:', result);
    };

    return <button onClick={generateImage}>生成图片</button>;
}
```

### 示例 2: 使用 Rednote API 智能配色

```javascript
// 如果引入了 rednote-api-integration-example.js
const colors = await window.RednoteAPIIntegration.extractColorFromImage(
    'https://example.com/image.jpg'
);

console.log('提取的配色:', colors);
```

---

## ⚠️ 注意事项

### 1. localStorage 键名冲突

modelapi 使用的键名：
- `magnes_api_configs` 
- `magnes_global_key` 

**建议**: 如果同时使用 baseapi 和 modelapi，它们会共享 `magnes_global_key`。

### 2. 配置管理冲突

如果引入完整的 `api-config-manager.js`，会同时存在两套配置管理：
- `window.BaseAPI.ConfigManager` 
- `window.APIConfigManager` 

**建议**: 
- 统一使用 `BaseAPI.ConfigManager`
- 仅在调用 API 时使用 `APIConfigManager` 的辅助函数

### 3. 全局命名空间

```javascript
// baseapi 挂载点
window.BaseAPI.Constants
window.BaseAPI.Storage
window.BaseAPI.ConfigManager

// modelapi 挂载点
window.APIConfigManager
window.RednoteAPIIntegration (如果引入)
```

---

## 🔧 推荐配置

### 最小引入（仅 API 调用）

```html
<head>
    <!-- baseapi（基础配置） -->
    <script src="baseapi/constants.js"></script>
    <script src="baseapi/storage.js"></script>
    <script src="baseapi/config-manager.js"></script>
    
    <!-- modelapi（仅 API 调用函数） -->
    <script src="modelapi/api-config-manager.js"></script>
</head>
```

### 完整引入（包含 Rednote）

```html
<head>
    <!-- baseapi -->
    <script src="baseapi/constants.js"></script>
    <script src="baseapi/storage.js"></script>
    <script src="baseapi/config-manager.js"></script>
    
    <!-- modelapi -->
    <script src="modelapi/api-config-manager.js"></script>
    <script src="modelapi/image-generation-helper.js"></script>
    <script src="modelapi/rednote-api-integration-example.js"></script>
</head>
```

---

## 📚 相关文档

- [baseapi README](../baseapi/README.md)
- [modelapi 使用文档](../modelapi/API-Config-Manager-Usage.md)
- [API 配置快速参考](../modelapi/API-Config-Quick-Reference.md)

---

**版本**: 1.0.0  
**创建时间**: 2026-01-05
