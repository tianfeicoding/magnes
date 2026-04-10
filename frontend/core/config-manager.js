/**
 * BaseAPI Config Manager
 * API 配置管理器
 * 
 * 提供配置管理的核心功能
 * @module baseapi/config-manager
 * @version 1.0.0
 */

(function (global) {
    'use strict';

    const { Constants, Storage } = global.BaseAPI || {};

    if (!Constants || !Storage) {
        console.error('BaseAPI ConfigManager 依赖未加载，请先引入 constants.js 和 storage.js');
        return;
    }

    /**
     * 获取所有 API 配置
     * 从 localStorage 加载，如果不存在则使用默认配置
     * @returns {Array} API 配置数组
     */
    function getAllConfigs() {
        const saved = Storage.loadConfigs();
        return saved || [...Constants.DEFAULT_API_CONFIGS];
    }

    /**
     * 根据 ID 获取配置
     * @param {string} id - 配置 ID
     * @returns {Object|null} API 配置对象
     */
    function getConfigById(id) {
        const configs = getAllConfigs();
        return configs.find(c => c.id === id) || null;
    }

    /**
     * 根据类型获取配置
     * @param {string} type - 配置类型 ('Chat' | 'Image' | 'Video')
     * @returns {Array} 符合类型的配置数组
     */
    function getConfigsByType(type) {
        const configs = getAllConfigs();
        return configs.filter(c => c.type === type);
    }

    /**
     * 创建配置 Map（用于快速查找）
     * @param {Array} configs - 配置数组
     * @returns {Map} 配置 Map
     */
    function createConfigsMap(configs) {
        const map = new Map();
        configs.forEach(config => {
            map.set(config.id, config);
        });
        return map;
    }

    /**
     * 更新配置
     * @param {Array} currentConfigs - 当前配置数组
     * @param {string} id - 配置 ID
     * @param {Object} updates - 更新的字段
     * @returns {Array} 更新后的配置数组
     */
    function updateConfig(currentConfigs, id, updates) {
        return currentConfigs.map(c =>
            c.id === id ? { ...c, ...updates } : c
        );
    }

    /**
     * 添加配置
     * @param {Array} currentConfigs - 当前配置数组
     * @param {Object} newConfig - 新配置对象
     * @returns {Array} 更新后的配置数组
     */
    function addConfig(currentConfigs, newConfig) {
        // 检查 ID 是否已存在
        if (currentConfigs.some(c => c.id === newConfig.id)) {
            console.error('配置 ID 已存在:', newConfig.id);
            return currentConfigs;
        }
        return [...currentConfigs, newConfig];
    }

    /**
     * 删除配置
     * @param {Array} currentConfigs - 当前配置数组
     * @param {string} id - 配置 ID
     * @returns {Array} 更新后的配置数组
     */
    function removeConfig(currentConfigs, id) {
        return currentConfigs.filter(c => c.id !== id);
    }

    /**
     * 重置为默认配置
     * @returns {Array} 默认配置数组
     */
    function resetToDefaults() {
        return [...Constants.DEFAULT_API_CONFIGS];
    }

    // 导出到全局命名空间
    if (!global.BaseAPI) {
        global.BaseAPI = {};
    }

    global.BaseAPI.ConfigManager = {
        getAllConfigs,
        getConfigById,
        getConfigsByType,
        createConfigsMap,
        updateConfig,
        addConfig,
        removeConfig,
        resetToDefaults
    };

    console.log('✅ BaseAPI ConfigManager 已加载');

})(typeof window !== 'undefined' ? window : global);
