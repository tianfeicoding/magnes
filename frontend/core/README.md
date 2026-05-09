# BaseAPI - 基础 API 配置模块

> 为 Magnes 和 Rednote 节点提供共享的 API 配置管理

## 📦 模块组成

- `constants.js` - API 配置常量（模型列表、比例、分辨率）
- `config-manager.js` - 配置管理核心功能
- `storage.js` - localStorage 存储封装

## 🧪 测试

在浏览器中打开 `baseapi/test.html` 进行 API 测试。

测试页面功能：
- ✅ 显示所有 API 配置
- ✅ 测试 API 连接状态
- ✅ 管理全局 API Key
- ✅ 查看测试日志
- ✅ 清除配置缓存

## 🚀 快速开始

### 引入模块

```html
<!-- 按顺序引入 -->
<script src="baseapi/constants.js"></script>
<script src="baseapi/storage.js"></script>
<script src="baseapi/config-manager.js"></script>
```

### 基础使用

```javascript
// 1. 获取所有配置
const configs = BaseAPI.ConfigManager.getAllConfigs();

// 2. 根据 ID 获取单个配置
const config = BaseAPI.ConfigManager.getConfigById('nano-banana-2');

// 3. 根据类型获取配置
const imageModels = BaseAPI.ConfigManager.getConfigsByType('Image');

// 4. 创建配置 Map（用于快速查找）
const configsMap = BaseAPI.ConfigManager.createConfigsMap(configs);

// 5. 更新配置
const updatedConfigs = BaseAPI.ConfigManager.updateConfig(
    configs,
    'nano-banana-2',
    { key: 'sk-xxx' }
);

// 6. 保存到 localStorage
BaseAPI.Storage.saveConfigs(updatedConfigs);
```

## 📚 API 参考

### Constants

- `BaseAPI.Constants.DEFAULT_BASE_URL` - 默认 API URL
- `BaseAPI.Constants.DEFAULT_API_CONFIGS` - 默认配置列表
- `BaseAPI.Constants.RATIOS` - 图片比例选项
- `BaseAPI.Constants.RESOLUTIONS` - 分辨率选项

### ConfigManager

- `getAllConfigs()` - 获取所有配置
- `getConfigById(id)` - 根据 ID 获取配置
- `getConfigsByType(type)` - 根据类型获取配置
- `createConfigsMap(configs)` - 创建配置 Map
- `updateConfig(configs, id, updates)` - 更新配置
- `addConfig(configs, newConfig)` - 添加配置
- `removeConfig(configs, id)` - 删除配置
- `resetToDefaults()` - 重置为默认配置

### Storage

- `saveConfigs(configs)` - 保存配置
- `loadConfigs()` - 加载配置
- `saveGlobalKey(key)` - 保存全局 Key
- `loadGlobalKey()` - 加载全局 Key
- `saveJimengUseLocalFile(value)` - 保存即梦设置
- `loadJimengUseLocalFile()` - 加载即梦设置
- `clearAll()` - 清除所有配置

## 🎯 支持的模型

### Chat Models (3个)
- Gemini 3 Pro
- GPT 5.1
- DeepSeek V3

### Image Models (8个)
- Nano Banana
- Nano Banana 2
- GPT-4o Image
- Flux 1.1 Pro
- Flux Dev
- Flux Kontext
- DALL-E 3
- Midjourney V6

### Video Models (2个)
- Sora 2
- Sora 2 Pro

## 💾 localStorage 键名

- `magnes_api_configs` - API 配置数组
- `magnes_global_key` - 全局 API Key
- `magnes_jimeng_use_local_file` - 即梦使用本地文件设置

## 📌 设计理念

- **纯函数**: ConfigManager 提供纯函数，不维护内部状态
- **不可变**: 所有操作返回新数组，不修改原数组
- **简洁**: 功能聚焦，易于理解和使用
- **共享**: Magnes 和 Rednote 节点共享同一份基础配置

## ⚡ 与 React Context 集成

```javascript
// 在 React 组件中
const [apiConfigs, setApiConfigs] = useState(() => {
    return BaseAPI.ConfigManager.getAllConfigs();
});

// 更新配置
const handleUpdate = (id, updates) => {
    const newConfigs = BaseAPI.ConfigManager.updateConfig(apiConfigs, id, updates);
    setApiConfigs(newConfigs);
    BaseAPI.Storage.saveConfigs(newConfigs);
};
```

---

**版本**: 1.0.0  
**创建时间**: 2026-01-05  
**维护者**: Magnes 开发团队
